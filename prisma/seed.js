const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const admin = await prisma.user.upsert({
    where: { email: "admin@truenote.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@truenote.com",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "admin",
    },
  });
  console.log("Admin created:", admin.email);

  const category = await prisma.category.upsert({
    where: { slug: "coffee" },
    update: {},
    create: { name: "Coffee", slug: "coffee" },
  });
  console.log("Category created:", category.name);

  const products = [
    {
      name: "Truenote Signature Blend",
      slug: "truenote-signature-blend",
      description: "Medium roast with cardamom and dark chocolate notes.",
      price: 18.99,
      stock: 100,
    },
    {
      name: "Cardamom Spice Blend",
      slug: "cardamom-spice-blend",
      description: "Aromatic blend infused with green cardamom pods.",
      price: 16.99,
      stock: 80,
    },
    {
      name: "Dark Roast Espresso",
      slug: "dark-roast-espresso",
      description: "Bold, intense espresso for the true coffee lover.",
      price: 19.99,
      stock: 60,
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: { ...p, categoryId: category.id },
    });
    console.log("Product created:", product.name);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
