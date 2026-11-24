import asyncio
import json
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import main


async def run_test():
    with tempfile.TemporaryDirectory() as tmp:
        orders_path = Path(tmp) / "orders_log.jsonl"
        sent_path = Path(tmp) / "telegram_sent.jsonl"

        order_id = "TEST-WORKER-001"

        record = {
            "orderId": order_id,
            "payload": {}
        }

        orders_path.write_text(
            json.dumps(record) + "\n",
            encoding="utf-8"
        )

        sent_path.touch()

        sender = AsyncMock(side_effect=[False, True])

        with (
            patch.object(main, "ORDERS_LOG_PATH", orders_path),
            patch.object(main, "TELEGRAM_SENT_PATH", sent_path),
            patch.object(main, "TELEGRAM_RETRY_INTERVAL", 0.1),
            patch.object(main, "send_telegram_message", sender),
            patch.object(main.IncomingOrder, "model_validate"),
            patch.object(main, "build_admin_message", return_value="Test")
        ):
            await main.start_notification_worker()

            try:
                for _ in range(100):
                    if order_id in main.load_telegram_sent_ids():
                        break
                    await asyncio.sleep(0.05)

                assert order_id in main.load_telegram_sent_ids()
                print("PASS: automatic retry successful")

                await asyncio.sleep(0.5)

                assert sender.call_count == 2
                print("PASS: no repeated delivery")

            finally:
                await main.stop_notification_worker()

            print("PASS: background worker stopped")


if __name__ == "__main__":
    asyncio.run(run_test())