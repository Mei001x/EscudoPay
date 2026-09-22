#!/usr/bin/env bash
set -e
BASE_URL="http://localhost:4000"

echo "=== 1. Crear reporte ==="
CREATE_RESP=$(curl -s -X POST "$BASE_URL/api/reports" -H "Content-Type: application/json" -d '{
  "informanteWallet": "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7",
  "delitoTipo": "extorsion",
  "descripcion": "Sospechoso identificado en zona comercial",
  "montoRecompensaSugerido": 3000
}')
echo "$CREATE_RESP" | jq .
CASE_ID=$(echo "$CREATE_RESP" | jq -r '.caseId')
if [ -z "$CASE_ID" ] || [ "$CASE_ID" = "null" ]; then
  echo "❌ No se pudo crear el caso. ¿El servidor está corriendo en $BASE_URL ?"
  echo "Ejecuta: pnpm --filter api dev"
  exit 1
fi
echo "✅ CASE_ID=$CASE_ID"

echo ""
echo "=== 2. Listar todos los casos ==="
curl -s "$BASE_URL/api/cases" | jq .

echo ""
echo "=== 3. Filtrar por status=recibido ==="
curl -s "$BASE_URL/api/cases?status=recibido" | jq .

echo ""
echo "=== 4. Consultar detalle (ESTE ERA TU 404 - ahora usa el ID real) ==="
DETAIL=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/cases/$CASE_ID")
BODY=$(echo "$DETAIL" | sed '$d')
CODE=$(echo "$DETAIL" | tail -n1)
echo "$BODY" | jq .
echo "HTTP $CODE"
if [ "$CODE" = "404" ]; then
  echo "❌ 404 - El ID no existe. Causas: pegaste PEGA_AQUI_EL_CASE_ID sin reemplazar, o reiniciaste el servidor."
else
  echo "✅ 200 OK"
fi

echo ""
echo "=== 5. Firma policía (aprobar) -> debe quedar en_verificacion ==="
curl -s -X POST "$BASE_URL/api/cases/$CASE_ID/signatures" -H "Content-Type: application/json" -d '{
  "signerWallet": "GC_POLICIA_WALLET_DEMO_123",
  "rol": "policia",
  "decision": "aprobar"
}' | jq .

echo ""
echo "=== 6. Firma fiscal (aprobar) -> debe quedar aprobado ==="
curl -s -X POST "$BASE_URL/api/cases/$CASE_ID/signatures" -H "Content-Type: application/json" -d '{
  "signerWallet": "GC_FISCAL_WALLET_DEMO_456",
  "rol": "fiscal",
  "decision": "aprobar"
}' | jq .

echo ""
echo "=== 7. Verificar aprobado ==="
curl -s "$BASE_URL/api/cases/$CASE_ID" | jq .

echo ""
echo "=== 8. Error esperado: mismo rol firma dos veces -> 400 ==="
curl -s -w "\nHTTP %{http_code}\n" -X POST "$BASE_URL/api/cases/$CASE_ID/signatures" -H "Content-Type: application/json" -d '{
  "signerWallet": "GC_POLICIA_WALLET_DEMO_123",
  "rol": "policia",
  "decision": "aprobar"
}' 

echo ""
echo "=== 9. Error esperado: ID inexistente -> 404 ==="
curl -s -w "\nHTTP %{http_code}\n" "$BASE_URL/api/cases/00000000-0000-0000-0000-000000000000"

echo ""
echo "✅ Todo listo. Tu 404 original era porque usabas PEGA_AQUI_EL_CASE_ID sin reemplazar."
echo "Con este script el ID se captura automático: CASE_ID=$CASE_ID"
