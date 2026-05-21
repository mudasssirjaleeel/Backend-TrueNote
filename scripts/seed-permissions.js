const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const rolePermissions = {
  super_admin: [
    "view_dashboard",
    "view_orders",
    "update_order_status",
    "cancel_order",
    "view_all_orders",
    "view_kds",
    "advance_order_status",
    "recall_order",
    "view_menu",
    "edit_menu",
    "toggle_availability",
    "view_beans",
    "edit_beans",
    "view_categories",
    "edit_categories",
    "view_banners",
    "edit_banners",
    "view_subscriptions",
    "manage_subscriptions",
    "view_customers",
    "manage_customers",
    "view_loyalty",
    "adjust_loyalty_points",
    "view_reports",
    "export_reports",
    "view_staff",
    "invite_staff",
    "manage_staff_roles",
    "view_settings",
    "edit_settings",
  ],
  manager: [
    "view_dashboard",
    "view_orders",
    "update_order_status",
    "cancel_order",
    "view_all_orders",
    "view_kds",
    "advance_order_status",
    "recall_order",
    "view_menu",
    "edit_menu",
    "toggle_availability",
    "view_beans",
    "edit_beans",
    "view_categories",
    "edit_categories",
    "view_banners",
    "edit_banners",
    "view_subscriptions",
    "manage_subscriptions",
    "view_customers",
    "view_loyalty",
    "view_reports",
    "export_reports",
  ],
  barista: ["view_kds", "advance_order_status", "recall_order"],
  counter: [
    "view_orders",
    "update_order_status",
    "cancel_order",
    "view_customers",
    "view_loyalty",
  ],
  rider: ["view_orders", "update_order_status"],
};

async function seedPermissions() {
  console.log("🌱 Seeding role permissions...");

  for (const [role, permissions] of Object.entries(rolePermissions)) {
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          role_permission: {
            role: role,
            permission: permission,
          },
        },
        update: {},
        create: {
          role: role,
          permission: permission,
        },
      });
    }
  }

  console.log("✅ Role permissions seeded successfully!");
  console.log("\n📋 Summary:");
  console.log(
    `   - super_admin: ${rolePermissions.super_admin.length} permissions`,
  );
  console.log(`   - manager: ${rolePermissions.manager.length} permissions`);
  console.log(`   - barista: ${rolePermissions.barista.length} permissions`);
  console.log(`   - counter: ${rolePermissions.counter.length} permissions`);
  console.log(`   - rider: ${rolePermissions.rider.length} permissions`);

  await prisma.$disconnect();
}

seedPermissions().catch((error) => {
  console.error("Error seeding permissions:", error);
  process.exit(1);
});
