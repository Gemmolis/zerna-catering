import asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import main


async def run_tests():
    with tempfile.TemporaryDirectory() as tmp:
        sent_path = Path(tmp) / "telegram_sent.jsonl"
        order_id = "TEST-RETRY-001"

        sender = AsyncMock(side_effect=[False, True])

        with patch.object(main, "TELEGRAM_SENT_PATH", sent_path):
            with patch.object(main, "send_telegram_message", sender):

                result = await main.notify_order_once(
                    order_id, "Test"
                )
                assert result is False
                assert order_id not in main.load_telegram_sent_ids()
                print("PASS: failed notification remains pending")

                result = await main.notify_order_once(
                    order_id, "Test"
                )
                assert result is True
                assert order_id in main.load_telegram_sent_ids()
                print("PASS: retry successful")

                result = await main.notify_order_once(
                    order_id, "Test"
                )
                assert result is True
                assert sender.call_count == 2
                print("PASS: duplicate notification prevented")


if __name__ == "__main__":
    asyncio.run(run_tests())