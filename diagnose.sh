#!/usr/bin/env bash
set -e

echo "=============================================="
echo "  Full Diagnostic Script"
echo "=============================================="

cd ~/bwanali-v3

# Syntax-check dashboard JavaScript
echo ""
echo "📄 Checking dashboard.html for JavaScript errors..."
awk '/<script>/,/<\/script>/' public/dashboard.html | tail -n +2 | head -n -1 > /tmp/dashboard_js.js
if node --check /tmp/dashboard_js.js 2>/tmp/dashboard_err.log; then
    echo "✅ No syntax errors."
else
    echo "❌ Syntax errors found:"
    cat /tmp/dashboard_err.log
fi

# Login
read -p "Enter your admin email: " EMAIL
read -s -p "Enter password: " PASSWORD
echo ""
echo "🔐 Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
    echo "❌ Login failed: $LOGIN_RESPONSE"
    exit 1
fi
echo "✅ Token obtained."

# Create a test student
echo ""
echo "👤 Creating test student..."
RANDOM_ID="TEST-$(date +%s)"
ENROLL_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/enrollments?tenant=demo" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\":\"Test\",
    \"lastName\":\"Student$RANDOM_ID\",
    \"className\":\"Grade 1\",
    \"section\":\"A\",
    \"gender\":\"Male\",
    \"dob\":\"2015-01-01\",
    \"enrollmentDate\":\"$(date +%Y-%m-%d)\"
  }")

STUDENT_ID=$(echo "$ENROLL_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
if [ -z "$STUDENT_ID" ]; then
    echo "❌ Failed to create student. Response:"
    echo "$ENROLL_RESPONSE"
    exit 1
fi
echo "✅ Student created with ID: $STUDENT_ID"

# Test payment
echo ""
echo "💳 Testing payment of K 100..."
PAYMENT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "http://localhost:3000/api/payments?tenant=demo" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"student_id\":\"$STUDENT_ID\",\"amount\":100,\"payment_method\":\"Cash\",\"remarks\":\"diagnostic\"}")

HTTP_CODE=$(echo "$PAYMENT_RESPONSE" | tail -1)
BODY=$(echo "$PAYMENT_RESPONSE" | sed '$d')
echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY"

if [ "$HTTP_CODE" -eq 201 ] || [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ Payment works."
else
    echo "❌ Payment failed."
fi

rm -f /tmp/dashboard_js.js /tmp/dashboard_err.log
echo "Done."
