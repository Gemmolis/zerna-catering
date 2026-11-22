
import asyncio

from fastapi import HTTPException
from starlette.requests import Request

from main import IncomingOrder, create_order


async def test_delivery_without_address():
    test_data = {
        "customer": {
            "name": "Тестовый клиент",
            "phone": "+79990000000",
            "vk": ""
        },
        "order": {
            "pickupType": "delivery",
            "deliveryAddress": "",
            "comment": "",
            "items": [
                {
                    "id": "36",
                    "name": "Тестовое блюдо",
                    "category": "Закуски",
                    "price": 150,
                    "quantity": 2,
                    "total": 300
                }
            ],
            "totalCount": 2,
            "totalPrice": 300
        },
        "consents": {
            "policyAccepted": True,
            "vkNotify": False
        },
        "meta": {
            "source": "website"
        }
    }

    order = IncomingOrder.model_validate(test_data)

    request = Request({
        "type": "http",
        "method": "POST",
        "path": "/api/orders/from-site",
        "headers": [],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 8000),
        "scheme": "http"
    })

    try:
        await create_order(order, request)
        print("ОШИБКА: заявка без адреса была принята")
    except HTTPException as exc:
        if exc.status_code == 400 and exc.detail == "Укажите адрес доставки":
            print("УСПЕХ: доставка без адреса отклонена")
            print("HTTP:", exc.status_code)
            print("Причина:", exc.detail)
        else:
            print("НЕОЖИДАННАЯ ОШИБКА:", exc.status_code, exc.detail)


asyncio.run(test_delivery_without_address())
