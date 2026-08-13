const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const http = require("http");
const axios = require("axios");
const { app } = require("../src/app");
const { supabase, supabaseAdmin } = require("../src/config/supabase");

async function testExpressAuthEndpoints() {
  console.log("=== TESTING EXPRESS AUTH ENDPOINTS ===");

  const server = http.createServer(app);
  const PORT = 5099;
  await new Promise((resolve) => server.listen(PORT, resolve));
  const baseURL = `http://localhost:${PORT}`;

  const testEmail = `test_endpoint_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  const testName = "Endpoint Tester";

  try {
    console.log(`\n--- Test 1: POST /api/auth/register (New User: ${testEmail}) ---`);
    const regRes = await axios.post(`${baseURL}/api/auth/register`, {
      name: testName,
      email: testEmail,
      password: testPassword
    });
    console.log("Register Response Status:", regRes.status);
    console.log("Register Response Body:", JSON.stringify(regRes.data, null, 2));

    console.log(`\n--- Test 2: POST /api/auth/register AGAIN (Duplicate Registration) ---`);
    try {
      await axios.post(`${baseURL}/api/auth/register`, {
        name: testName,
        email: testEmail,
        password: testPassword
      });
    } catch (err) {
      console.log("Duplicate Register Status:", err.response?.status);
      console.log("Duplicate Register Body:", JSON.stringify(err.response?.data, null, 2));
    }

    console.log(`\n--- Test 3: POST /api/auth/login (Unverified User) ---`);
    try {
      await axios.post(`${baseURL}/api/auth/login`, {
        email: testEmail,
        password: testPassword
      });
    } catch (err) {
      console.log("Login Unverified Status:", err.response?.status);
      console.log("Login Unverified Body:", JSON.stringify(err.response?.data, null, 2));
    }

    console.log(`\n--- Test 4: POST /api/auth/resend-verification ---`);
    const resendRes = await axios.post(`${baseURL}/api/auth/resend-verification`, {
      email: testEmail
    });
    console.log("Resend Status:", resendRes.status);
    console.log("Resend Body:", JSON.stringify(resendRes.data, null, 2));

    console.log(`\n--- Test 5: POST /api/auth/manual-verify ---`);
    const verifyRes = await axios.post(`${baseURL}/api/auth/manual-verify`, {
      email: testEmail
    });
    console.log("Manual Verify Status:", verifyRes.status);
    console.log("Manual Verify Body:", JSON.stringify(verifyRes.data, null, 2));

    console.log(`\n--- Test 6: POST /api/auth/login (Verified User) ---`);
    const loginRes = await axios.post(`${baseURL}/api/auth/login`, {
      email: testEmail,
      password: testPassword
    });
    console.log("Login Verified Status:", loginRes.status);
    console.log("Login Verified Body:", JSON.stringify(loginRes.data, null, 2));

    let token = loginRes.data.token;

    console.log(`\n--- Test 7: GET /api/auth/me (With Bearer Token) ---`);
    const meRes = await axios.get(`${baseURL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("GET /me Status:", meRes.status);
    console.log("GET /me Body:", JSON.stringify(meRes.data, null, 2));

  } catch (err) {
    console.error("Test Error:", err.response?.data || err.message);
  } finally {
    console.log(`\n--- Cleanup: Deleting test user ---`);
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const targetUser = users?.users?.find(u => u.email?.toLowerCase() === testEmail.toLowerCase());
    if (targetUser) {
      await supabaseAdmin.auth.admin.deleteUser(targetUser.id);
      await supabase.from("profiles").delete().eq("id", targetUser.id);
      console.log("Cleanup complete!");
    }
    server.close();
  }
}

testExpressAuthEndpoints();
