---
name: yeastar-gsm-control
description: Operational skill for managing Yeastar TG1600 GSM Gateway channels and routing
---

# Yeastar TG1600 GSM Gateway Execution Skill

When generating or debugging code that interacts with the Yeastar TG1600 SIM Gateway:

1. **SIM Channel Mapping:**
   - Physical ports are indexed `1` through `16`.
   - Always map application user sessions to an explicit `port` parameter (e.g., `port=1`).

2. **HTTP CGI Request Formatting:**
   - Format outbound SMS HTTP queries as:
     `http://<GATEWAY_IP>/cgi/WebCGI?1500101=account=<USER>&password=<PASS>&port=<PORT>&destination=<PHONE>&content=<ENCODED_TEXT>`
   - Ensure `content` string is strictly encoded via `encodeURIComponent()`.

3. **Asterisk PJSIP Trunking Rule:**
   - Route SIP outbound voice calls through Yeastar using:
     `Channel: PJSIP/<PHONE>@yeastar-gateway`