import asyncio
import json
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
import html
from datetime import date

import httpx
from fastapi import FastAPI, HTTPException, Request

from yandex_disk_upload import upload_order_json as yandex_upload_order_json
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Cafe Orders API")

MENU_PATH = Path(__file__).resolve().parent / "data" / "menu.json"


def load_menu_prices() -> dict[int, float]:
    """Загружает актуальные цены из каталога кейтеринга."""
    try:
        with MENU_PATH.open("r", encoding="utf-8") as file:
            menu = json.load(file)

        return {
            int(item["id"]): float(item["price"])
            for item in menu["items"]
        }
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=500,
            detail="Не удалось загрузить каталог товаров"
        ) from exc
def load_secrets_from_file(filename: str = "vk_secrets.env") -> None:
    """
    Читает KEY=VALUE из файла рядом с main.py и подставляет в os.environ.
    Уже заданные переменные окружения не перезаписываются.
    """
    path = Path(__file__).resolve().parent / filename
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_secrets_from_file()

# ===== CORS =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # на проде заменить на конкретные домены
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== Pydantic-схемы =====
class OrderItem(BaseModel):
    id: str
    name: str
    category: Optional[str] = None
    price: float
    quantity: int
    total: float


class Customer(BaseModel):
    name: str
    phone: str
    vk: Optional[str] = None



class EventData(BaseModel):
    type: Optional[str] = None
    format: Optional[str] = None
    date: date
    guestCount: int = Field(..., ge=1)


def validate_event_date(event: EventData):
    if event.date < date.today():
        raise HTTPException(
            status_code=400,
            detail="Дата мероприятия не может быть в прошлом"
        )


class OrderData(BaseModel):
    pickupType: str = Field(..., description="delivery / pickup")
    deliveryAddress: Optional[str] = None
    comment: Optional[str] = None
    items: List[OrderItem]
    totalCount: int
    totalPrice: float
    event: Optional[EventData] = None


class Consents(BaseModel):
    policyAccepted: bool
    vkNotify: bool = False


class Meta(BaseModel):
    source: str = "website"


class IncomingOrder(BaseModel):
    customer: Customer
    order: OrderData
    consents: Consents
    meta: Meta


class OutgoingResponse(BaseModel):
    status: str
    orderId: str
    message: str


# ===== VK =====
VK_GROUP_TOKEN = os.getenv("VK_GROUP_TOKEN", "").strip()
VK_API_URL = "https://api.vk.com/method"
VK_API_VERSION = "5.199"

try:
    ADMIN_VK_PEER_ID = int(os.getenv("ADMIN_VK_PEER_ID", "0").strip() or "0")
except ValueError:
    ADMIN_VK_PEER_ID = 0

# ===== Telegram =====
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
ADMIN_TELEGRAM_ID = os.getenv("ADMIN_TELEGRAM_ID", "").strip()

# ===== Яндекс.Диск =====
YANDEX_DISK_TOKEN = os.getenv("YANDEX_DISK_TOKEN", "").strip()
YANDEX_DISK_FOLDER = os.getenv("YANDEX_DISK_FOLDER", "zerna-cafe-orders").strip().strip("/")

# ===== Запись заказов на диск =====
DATA_DIR = Path(__file__).resolve().parent / "data"
ORDERS_LOG_PATH = DATA_DIR / "orders_log.jsonl"
_orders_write_lock = asyncio.Lock()

# ===== Лимит POST /api/orders по IP =====
_rate_lock = asyncio.Lock()
_rate_by_ip: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=48))
ORDER_RATE_WINDOW_SEC = 60.0
ORDER_RATE_MAX = 12


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    if request.client:
        return request.client.host
    return "unknown"


async def enforce_order_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    async with _rate_lock:
        q = _rate_by_ip[client_ip]
        while q and now - q[0] > ORDER_RATE_WINDOW_SEC:
            q.popleft()
        if len(q) >= ORDER_RATE_MAX:
            raise HTTPException(
                status_code=429,
                detail="Слишком много заявок с этого адреса. Подождите минуту и попробуйте снова.",
            )
        q.append(now)


def _append_order_line_sync(order_id: str, payload: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "ts_utc": datetime.now(timezone.utc).isoformat(),
        "orderId": order_id,
        "payload": payload,
    }
    with open(ORDERS_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


async def persist_order_to_file(order_id: str, order: IncomingOrder) -> None:
    payload = order.model_dump(mode="json")
    try:
        async with _orders_write_lock:
            await asyncio.to_thread(_append_order_line_sync, order_id, payload)
    except OSError as exc:
        print("[ORDER LOG ERROR]", exc)
        raise HTTPException(
            status_code=503,
            detail="Не удалось сохранить заказ. Попробуйте через минуту или позвоните в кафе.",
        ) from exc


def generate_order_id() -> str:
    """Генерируем ID заказа вида RZ-YYYYMMDD-HHMMSS."""
    now = datetime.now()
    return now.strftime("RZ-%Y%m%d-%H%M%S")



def build_admin_message(order_id: str, data: IncomingOrder) -> str:
    """Формируем уведомление о заявке для менеджера."""

    def safe(value):
        return html.escape(str(value if value is not None else ""))

    lines = [
        f"<b>Новая заявка на кейтеринг № {safe(order_id)}</b>",
        "",
    ]

    event = data.order.event

    if event:
        type_map = {
            "corporate": "Корпоративное",
            "private": "Частное",
        }
        format_map = {
            "buffet": "Фуршет",
            "coffee-break": "Кофе-брейк",
            "banquet": "Банкет",
        }

        lines.append("<b>Мероприятие:</b>")
        lines.append(
            f"Тип: {safe(type_map.get(event.type, event.type))}"
        )
        lines.append(
            f"Формат: {safe(format_map.get(event.format, event.format))}"
        )
        lines.append(f"Дата: {safe(event.date)}")
        lines.append(f"Количество гостей: {safe(event.guestCount)}")
        lines.append("")

    lines.extend([
        f"<b>Имя:</b> {safe(data.customer.name)}",
        f"<b>Телефон:</b> {safe(data.customer.phone)}",
    ])

    if data.customer.vk:
        lines.append(f"<b>VK:</b> {safe(data.customer.vk)}")

    pickup_map = {
        "delivery": "Доставка",
        "pickup": "Самовывоз",
        "in_cafe": "В кафе",
        "takeaway": "С собой",
        "preorder": "Предзаказ ко времени",
}

    pickup_label = pickup_map.get(
        data.order.pickupType,
        data.order.pickupType
    )
    lines.append(f"<b>Способ получения:</b> {safe(pickup_label)}")
    if data.order.pickupType == "delivery" and data.order.deliveryAddress:
        lines.append(
         f"<b>Адрес доставки:</b> {safe(data.order.deliveryAddress)}"
    )
    lines.append("")

    lines.append("<b>Состав заказа:</b>")

    for idx, item in enumerate(data.order.items, start=1):
        line = (
            f"{idx}. {safe(item.name)} × {item.quantity}"
            f" = {int(item.total)} ₽"
        )
        if item.category:
            line += f" ({safe(item.category)})"
        lines.append(line)

    lines.append("")

    if data.order.comment:
        lines.append("<b>Комментарий:</b>")
        lines.append(safe(data.order.comment))
        lines.append("")

    lines.append("<b>Предварительная стоимость:</b>")
    lines.append(
        f"{data.order.totalCount} позиций / "
        f"{int(data.order.totalPrice)} ₽"
    )

    if event and event.guestCount and event.guestCount > 0:
        per_guest = data.order.totalPrice / event.guestCount
        lines.append(f"Ориентировочно на гостя: {per_guest:.0f} ₽")

    lines.append("")
    lines.append("<i>Окончательная стоимость согласовывается с менеджером.</i>")

    return "\n".join(lines)


async def send_telegram_message(chat_id: str, text: str) -> None:
    """Отправляет сообщение в Telegram через Bot API."""
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        print("[INFO] Telegram токен или ID админа не заданы, уведомление не отправлено.")
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"  # Разрешает использовать жирный шрифт
    }
    
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(url, json=payload)
            data = resp.json()
            if not data.get("ok"):
                print("[TELEGRAM ERROR]", data)
            else:
                print("[TELEGRAM] Уведомление успешно отправлено админу.")
        except Exception as exc:
            print("[TELEGRAM SEND ERROR]", exc)


def validate_order_totals(order: IncomingOrder) -> None:
    """Проверяет количество и стоимость заказа по серверному каталогу."""
    menu_prices = load_menu_prices()
    items = order.order.items

    computed_count = 0
    computed_price = 0.0

    for item in items:
        # Поддерживаем обычные ID и составные ID с модификаторами.
        product_id_str = str(item.id).split("_")[0]

        try:
            product_id = int(product_id_str)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Некорректный ID товара: {item.id}"
            )

        if product_id not in menu_prices:
            raise HTTPException(
                status_code=400,
                detail=f"Товар отсутствует в каталоге: {item.name}"
            )

        if "_" in str(item.id):
            raise HTTPException(
                status_code=400,
                detail="Товары с модификаторами пока не поддерживаются"
            )

        if item.quantity <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Некорректное количество товара: {item.name}"
            )

        actual_price = menu_prices[product_id]

        if abs(float(item.price) - actual_price) > 0.02:
            raise HTTPException(
                status_code=400,
                detail=f"Цена товара не совпадает с каталогом: {item.name}"
            )

        expected_total = actual_price * item.quantity

        if abs(float(item.total) - expected_total) > 0.02:
            raise HTTPException(
                status_code=400,
                detail=f"Неверная сумма по позиции: {item.name}"
            )

        computed_count += item.quantity
        computed_price += expected_total

    if computed_count != order.order.totalCount:
        raise HTTPException(
            status_code=400,
            detail="Неверное количество позиций в заказе"
        )

    if abs(computed_price - float(order.order.totalPrice)) > 0.02:
        raise HTTPException(
            status_code=400,
            detail="Неверная сумма заказа"
        )


# ===== Основной endpoint для сайта =====
@app.post("/api/orders/from-site", response_model=OutgoingResponse)
async def create_order(order: IncomingOrder, request: Request):
    # 1. Валидация
    if not order.consents.policyAccepted:
        raise HTTPException(status_code=400, detail="Нет согласия на обработку заявки")
    if not order.order.items:
        raise HTTPException(status_code=400, detail="Корзина пуста")
    if not order.customer.name.strip():
        raise HTTPException(status_code=400, detail="Не указано имя")
    if not order.customer.phone.strip():
        raise HTTPException(status_code=400, detail="Не указан телефон")
    if not order.order.pickupType:
        raise HTTPException(status_code=400, detail="Не указан способ получения")

    if order.order.pickupType not in ("delivery", "pickup"):
        raise HTTPException(
            status_code=400,
            detail="Недопустимый способ получения заказа"
        )

    if order.order.pickupType == "delivery":
        if not (order.order.deliveryAddress or "").strip():
            raise HTTPException(
                status_code=400,
                detail="Укажите адрес доставки"
            )

    # Проверяем дату мероприятия
    if order.order.event is None:
        raise HTTPException(
            status_code=400,
            detail="Не указаны данные мероприятия"
        )

    validate_event_date(order.order.event)

    validate_order_totals(order)
    await enforce_order_rate_limit(_client_ip(request))

    # 2. Генерируем ID
    order_id = generate_order_id()

    # 3. Сохраняем заказ в файл
    await persist_order_to_file(order_id, order)

    if YANDEX_DISK_TOKEN:
        try:
            await yandex_upload_order_json(
                YANDEX_DISK_TOKEN,
                YANDEX_DISK_FOLDER,
                order_id,
                order.model_dump(mode="json"),
            )
            print(f"[YANDEX DISK] Заказ {order_id} загружен в папку «{YANDEX_DISK_FOLDER}»")
        except Exception as exc:
            print("[YANDEX DISK ERROR]", repr(exc))

    print("\n[NEW ORDER]")
    print("ID:", order_id)
    print(json.dumps(order.model_dump(), indent=2, ensure_ascii=False))
    print("[/NEW ORDER]\n")

    admin_text = build_admin_message(order_id, order)

    # 4. Отправляем уведомление в Telegram
    try:
        await send_telegram_message(ADMIN_TELEGRAM_ID, admin_text)
    except Exception as exc:
        print("[TG SEND ERROR]", exc)

    return OutgoingResponse(
        status="success",
        orderId=order_id,
        message="Заказ принят в обработку",
    )