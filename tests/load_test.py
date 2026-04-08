"""Simple load test for EduAgent API.
Usage: python tests/load_test.py [base_url] [num_requests] [concurrency]
"""
import asyncio
import httpx
import sys
import time

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:9251"
NUM_REQUESTS = int(sys.argv[2]) if len(sys.argv) > 2 else 100
CONCURRENCY = int(sys.argv[3]) if len(sys.argv) > 3 else 20

ENDPOINTS = [
    ("GET", "/api/courses"),
    ("GET", "/api/analytics/overview"),
    ("GET", "/api/agents"),
    ("GET", "/api/analytics/mastery/00000000-0000-4000-b000-000000000001"),
]


async def make_request(client: httpx.AsyncClient, method: str, path: str) -> tuple[int, float]:
    start = time.monotonic()
    try:
        resp = await client.request(method, f"{BASE_URL}{path}")
        elapsed = time.monotonic() - start
        return resp.status_code, elapsed
    except Exception:
        return 0, time.monotonic() - start


async def main():
    print(f"Load test: {NUM_REQUESTS} requests, {CONCURRENCY} concurrent")
    print(f"Target: {BASE_URL}")
    print()

    async with httpx.AsyncClient(timeout=30.0) as client:
        semaphore = asyncio.Semaphore(CONCURRENCY)
        results = []

        async def limited_request(method, path):
            async with semaphore:
                return await make_request(client, method, path)

        start = time.monotonic()
        tasks = []
        for i in range(NUM_REQUESTS):
            method, path = ENDPOINTS[i % len(ENDPOINTS)]
            tasks.append(limited_request(method, path))

        results = await asyncio.gather(*tasks)
        total_time = time.monotonic() - start

    # Report
    statuses = {}
    latencies = []
    for status_code, latency in results:
        statuses[status_code] = statuses.get(status_code, 0) + 1
        latencies.append(latency)

    latencies.sort()
    print(f"Results:")
    print(f"  Total time: {total_time:.1f}s")
    print(f"  Throughput: {NUM_REQUESTS/total_time:.1f} req/s")
    print(f"  Status codes: {statuses}")
    print(f"  Latency p50: {latencies[len(latencies)//2]*1000:.0f}ms")
    print(f"  Latency p95: {latencies[int(len(latencies)*0.95)]*1000:.0f}ms")
    print(f"  Latency p99: {latencies[int(len(latencies)*0.99)]*1000:.0f}ms")


if __name__ == "__main__":
    asyncio.run(main())
