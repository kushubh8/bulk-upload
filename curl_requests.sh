#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Curl requests for the Multiplier Bulk Upload API
# Base URL defaults to localhost:3000 — override with: BASE_URL=http://... ./curl_requests.sh
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=================================================="
echo "  Multiplier Bulk Upload API — curl examples"
echo "  Base URL: $BASE_URL"
echo "=================================================="
echo ""

# ── 1. Health check ───────────────────────────────────────────────────────────
echo "--- 1. Health Check ---"
curl -s -X GET "$BASE_URL/health" \
  -H "Accept: application/json" | jq .

echo ""

# ── 2. Bulk upload (valid CSV) ────────────────────────────────────────────────
echo "--- 2. Bulk Upload (sample_employees.csv) ---"
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/employees/bulk-upload" \
  -F "file=@$(dirname "$0")/sample_employees.csv;type=text/csv")

echo "$UPLOAD_RESPONSE" | jq .

# Extract uploadId for subsequent status checks
UPLOAD_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.uploadId // empty')

echo ""

# ── 3. Poll upload status ─────────────────────────────────────────────────────
if [ -n "$UPLOAD_ID" ]; then
  echo "--- 3. Upload Status (uploadId: $UPLOAD_ID) ---"
  curl -s -X GET "$BASE_URL/uploads/$UPLOAD_ID/status" \
    -H "Accept: application/json" | jq .
  echo ""

  echo "--- 3b. Poll until completed/failed (up to 30s) ---"
  for i in $(seq 1 10); do
    STATUS_RESP=$(curl -s -X GET "$BASE_URL/uploads/$UPLOAD_ID/status" \
      -H "Accept: application/json")
    STATUS=$(echo "$STATUS_RESP" | jq -r '.status // empty')
    echo "  [attempt $i] status: $STATUS"
    echo "$STATUS_RESP" | jq .
    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
      break
    fi
    sleep 3
  done
else
  echo "--- 3. Skipped — no uploadId returned ---"
fi

echo ""

# ── 4. Upload with an invalid file type (should return 400) ───────────────────
echo "--- 4. Invalid File Type (txt instead of csv) ---"
curl -s -X POST "$BASE_URL/employees/bulk-upload" \
  -F "file=@$(dirname "$0")/sample_employees.csv;type=text/plain" | jq .

echo ""

# ── 5. Upload with no file attached (should return 400) ───────────────────────
echo "--- 5. No File Attached ---"
curl -s -X POST "$BASE_URL/employees/bulk-upload" \
  -H "Content-Type: multipart/form-data" | jq .

echo ""

# ── 6. Status for a non-existent uploadId (should return 404) ─────────────────
echo "--- 6. Non-existent Upload ID ---"
curl -s -X GET "$BASE_URL/uploads/non-existent-id-00000/status" \
  -H "Accept: application/json" | jq .

echo ""

# ── 7. Unknown route (should return 404) ──────────────────────────────────────
echo "--- 7. Unknown Route ---"
curl -s -X GET "$BASE_URL/unknown-route" \
  -H "Accept: application/json" | jq .

echo ""
echo "=================================================="
echo "  Done."
echo "=================================================="
