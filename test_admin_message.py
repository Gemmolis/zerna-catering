
from main import IncomingOrder, build_admin_message

test_data = {
    "customer": {
        "name": "Анна Тестовая",
        "phone": "+79990000000",
        "vk": ""
    },
    "order": {
        "pickupType": "takeaway",
        "comment": "Нужен стол для фуршета",
        "items": [
            {
                "id": "test-1",
                "name": "Мини-сэндвич",
                "category": "Закуски",
                "price": 150,
                "quantity": 20,
                "total": 3000
            }
        ],
        "totalCount": 20,
        "totalPrice": 3000,
        "event": {
            "type": "corporate",
            "format": "buffet",
            "date": "2026-12-15",
            "guestCount": 20
        }
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

message = build_admin_message("TEST-001", order)

print(message)
