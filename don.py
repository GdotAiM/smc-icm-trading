


import os
import time
from google import genai

client = genai.Client(
    api_key=os.environ.get("GCP_API_KEY", ""),
)

tools = [
    {
        'type': 'code_execution',
    },
    {
        'type': 'google_search',
    },
    {
        'type': 'url_context',
    },
]

interaction = client.interactions.create(
    agent='antigravity-preview-05-2026',
    input='',
    background=True,
    tools=tools,
    environment={
        'type': 'remote',
        'network': 'disabled',
    },
)

print(f"Research started: {interaction.id}")

while True:
    interaction = client.interactions.get(interaction.id)
    if interaction.status == "completed":
        print(interaction.output_text)
        break
    elif interaction.status == "failed":
        print(f"Research failed: {interaction.error}")
        break
    time.sleep(10)


