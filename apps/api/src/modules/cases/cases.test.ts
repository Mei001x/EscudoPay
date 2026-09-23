import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:4000";

test("Flujo E2E completo de EscudoPay (7 endpoints)", async (t) => {
  let caseId = "";

  await t.test("1. POST /api/auth/login", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo: "PNP-DIRNIC-04821",
        clave: "secreto123",
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.equal(data.rol, "policia");
  });

  await t.test("2. POST /api/reports - Crear caso", async () => {
    const res = await fetch(`${BASE_URL}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        informanteWallet: "GDQJUTQYK2MQX2VGDR2FYWLIYAQIEGXTQVTFEMGH2BEWFG4BRUY4CKI7",
        delitoTipo: "extorsion",
        descripcion: "Ubicación de sospechoso vinculado a cobro de cupo",
        montoRecompensaSugerido: 5000,
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.caseId);
    assert.equal(data.status, "recibido");
    assert.ok(data.evidenciaAncladaTx);
    caseId = data.caseId;
  });

  await t.test("3. GET /api/cases - Listar casos", async () => {
    const res = await fetch(`${BASE_URL}/api/cases`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.total >= 1);
    assert.ok(Array.isArray(data.casos));
  });

  await t.test("4. GET /api/cases/:id - Detalle inicial", async () => {
    const res = await fetch(`${BASE_URL}/api/cases/${caseId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.caseId, caseId);
    assert.equal(data.firmas.requeridas, 2);
  });

  await t.test("5. POST /api/cases/:id/verify - Firma 1 (Policía)", async () => {
    const res = await fetch(`${BASE_URL}/api/cases/${caseId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rol: "policia",
        verificadorWallet: "G_POLICIA_WALLET_12345",
        resultado: "aprobado",
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "en_verificacion");
    assert.equal(data.firmasObtenidas, 1);
  });

  await t.test("6. POST /api/cases/:id/verify - Firma 2 (Fiscalía)", async () => {
    const res = await fetch(`${BASE_URL}/api/cases/${caseId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rol: "fiscalia",
        verificadorWallet: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
        resultado: "aprobado",
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "listo_para_liberar");
    assert.equal(data.firmasObtenidas, 2);
  });

  await t.test("7. POST /api/cases/:id/release - Liberar pago", async () => {
    const res = await fetch(`${BASE_URL}/api/cases/${caseId}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "pagado");
    assert.ok(data.tx);
    assert.equal(data.montoLiberado, 5000);
  });

  await t.test("8. GET /api/cases/:id/proof - Auditoría pública", async () => {
    const res = await fetch(`${BASE_URL}/api/cases/${caseId}/proof`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.evidenciaHash);
    assert.ok(data.explorerLinks.evidencia);
    assert.ok(data.explorerLinks.pago);
  });
});
