import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { users } from "./db/schema";

const db = drizzle(process.env.DATABASE_URL!);

async function main() {
  const user: typeof users.$inferInsert = {
    name: "Hello",
    email: "hello.aqib",
  };

  await db.insert(users).values(user);
  console.log("New user created!");
  const users1 = await db.select().from(users);
  console.log("Getting users", users1);
  await db.update(users).set({ email: "hi.ansari" });
  console.log("User info updated");
}

main();
