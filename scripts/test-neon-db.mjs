import { NeonDriver } from "../server/db/neon.js";
import { applyMigrations } from "../server/db/factory.js";
import { AppDatabase } from "../server/db/repository.js";

const dbUrl = process.env.DATABASE_URL;
console.log("Testing Neon Lakebase Postgres with URL:", dbUrl ? dbUrl.replace(/:[^:@]+@/, ":***@") : undefined);

async function main() {
  const driver = new NeonDriver({ connectionString: dbUrl });

  console.log("1. Applying migrations on Neon Lakebase Postgres...");
  const applied = await applyMigrations(driver);
  console.log("   Migrations applied (or already up to date):", applied);

  console.log("2. Initializing AppDatabase repository...");
  const app = new AppDatabase(driver);

  console.log("3. Testing user upsert...");
  const user = await app.upsertOAuthUser({
    provider: "neon",
    providerAccountId: "neon_test_sub_123",
    email: "test@neon.tech",
    name: "Neon Test User",
    avatarUrl: null,
  });
  console.log("   User created/found with id:", user.id);

  console.log("4. Testing user preferences...");
  await app.savePrefs(user.id, {
    theme: "dark",
    sidebarWidth: 280,
    directBrowser: false,
    preferences: { test: true },
  });
  const prefs = await app.getPrefs(user.id);
  console.log("   User preferences retrieved:", prefs);

  console.log("5. Testing conversation and message persistence...");
  const conv = await app.createConversation({
    userId: user.id,
    title: "Neon Test Chat",
  });
  console.log("   Conversation created:", conv.id);

  const messageId = crypto.randomUUID();
  await app.appendMessage({
    id: messageId,
    conversationId: conv.id,
    role: "user",
    content: "Testing Neon Postgres!",
  });
  console.log("   Message created:", messageId);

  const messages = await app.listMessages(conv.id);
  console.log("   Messages in conversation:", messages.length);

  console.log("6. Testing clean up...");
  await app.deleteConversation(user.id, conv.id);
  console.log("   Conversation deleted.");

  console.log("ALL DATABASE TESTS PASSED!");
}

main().catch(err => {
  console.error("Database test failed:", err);
  process.exit(1);
});
