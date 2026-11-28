
import asyncio
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from main import IncomingOrder, create_order, build_admin_message


def make_order(slot=None, method="delivery"):
    return IncomingOrder.model_validate({
        "customer": {
            "name": "Тестовый клиент",
            "phone": "+79990000000"
        },
        "order": {
            "pickupType": method,
            "pickupTime": slot,
            "deliveryAddress": "Тестовый адрес",
            "items": [{
                "id": "2",
                "name": "Mini Caesar",
                "price": 200,
                "quantity": 1,
                "total": 200
            }],
            "totalCount": 1,
            "totalPrice": 200,
            "event": {
                "type": "corporate",
                "format": "buffet",
                "date": (date.today() + timedelta(days=7)).isoformat(),
                "guestCount": 10
            }
        },
        "consents": {
            "policyAccepted": True
        },
        "meta": {
            "source": "test"
        }
    })


async def run_tests():
    with (
        patch("main.validate_order_totals"),
        patch("main._client_ip", return_value="127.0.0.1"),
        patch("main.enforce_order_rate_limit", new_callable=AsyncMock),
        patch("main.persist_order_to_file", new_callable=AsyncMock) as save,
        patch("main.notify_order_once", new_callable=AsyncMock, return_value=True),
        patch("main.YANDEX_DISK_TOKEN", "")
    ):
        # 1. All allowed intervals
        for hour in range(10, 21):
            slot = f"{hour:02d}:00–{hour + 1:02d}:00"
            result = await create_order(make_order(slot), None)
            assert result.status == "success"

        assert save.await_count == 11
        print("PASS 1: all 11 valid slots accepted")

        # 2. Missing interval
        # 3. Invalid intervals
        for slot in [
            None,
            "",
            "01:00–02:00",
            "09:00–10:00",
            "21:00–22:00",
            "16:00–18:00",
            "16:30–17:30",
            "25:00–26:00"
        ]:
            try:
                await create_order(make_order(slot), None)
            except HTTPException as exc:
                assert exc.status_code == 400
            else:
                raise AssertionError(f"Invalid slot accepted: {slot}")

        assert save.await_count == 11
        print("PASS 2: missing and invalid slots rejected")

        # 4. Old order compatibility
        old_payload = make_order().model_dump(mode="json")
        old_payload["order"].pop("pickupTime")

        old_order = IncomingOrder.model_validate(old_payload)
        assert old_order.order.pickupTime is None
        build_admin_message("TEST-OLD", old_order)
        print("PASS 3: old order compatibility")

        # 5. JSON serialization
        order = make_order("16:00–17:00")
        payload = order.model_dump(mode="json")
        assert payload["order"]["pickupTime"] == "16:00–17:00"
        print("PASS 4: time slot serialization")

        # 6. Telegram message: delivery
        message = build_admin_message("TEST-001", order)
        assert "Желаемый интервал доставки" in message
        assert "16:00–17:00" in message
        print("PASS 5: delivery notification")

        # 7. Telegram message: pickup
        order = make_order("10:00–11:00", "pickup")
        message = build_admin_message("TEST-002", order)
        assert "Желаемый интервал самовывоза" in message
        assert "10:00–11:00" in message
        print("PASS 6: pickup notification")

    print("\nALL TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run_tests())
