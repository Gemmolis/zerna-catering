from types import SimpleNamespace
from fastapi import HTTPException
from main import validate_order_totals


def make_order(price):
    item = SimpleNamespace(
        id="2",
        name="Mini Caesar",
        price=price,
        quantity=1,
        total=price,
    )

    return SimpleNamespace(
        order=SimpleNamespace(
            items=[item],
            totalCount=1,
            totalPrice=price,
        )
    )


# Тест 1: правильная цена
try:
    validate_order_totals(make_order(200.0))
    print("PASS: correct price accepted")
except HTTPException as exc:
    print(f"FAIL: correct price rejected: {exc.detail}")


# Тест 2: подменённая цена
try:
    validate_order_totals(make_order(20.0))
    print("FAIL: incorrect price accepted")
except HTTPException as exc:
    if exc.status_code == 400 and "Цена товара" in str(exc.detail):
        print("PASS: incorrect price rejected")
    else:
        print(f"FAIL: unexpected error: {exc.status_code} {exc.detail}")