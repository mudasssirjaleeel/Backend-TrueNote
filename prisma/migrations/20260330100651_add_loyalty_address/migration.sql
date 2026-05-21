-- CreateTable
CREATE TABLE "loyalty_points" (
    "id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "points_cost" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reward_id" TEXT NOT NULL,
    "points_spent" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earn_actions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "points_earned" INTEGER NOT NULL,
    "action_key" TEXT NOT NULL,
    "max_per_user" INTEGER DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "earn_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_earn_actions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "earn_action_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_earn_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_points_user_id_idx" ON "loyalty_points"("user_id");

-- CreateIndex
CREATE INDEX "redemptions_user_id_idx" ON "redemptions"("user_id");

-- CreateIndex
CREATE INDEX "redemptions_reward_id_idx" ON "redemptions"("reward_id");

-- CreateIndex
CREATE UNIQUE INDEX "earn_actions_action_key_key" ON "earn_actions"("action_key");

-- CreateIndex
CREATE INDEX "user_earn_actions_user_id_idx" ON "user_earn_actions"("user_id");

-- CreateIndex
CREATE INDEX "user_earn_actions_earn_action_id_idx" ON "user_earn_actions"("earn_action_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_earn_actions_user_id_earn_action_id_key" ON "user_earn_actions"("user_id", "earn_action_id");

-- AddForeignKey
ALTER TABLE "loyalty_points" ADD CONSTRAINT "loyalty_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_earn_actions" ADD CONSTRAINT "user_earn_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_earn_actions" ADD CONSTRAINT "user_earn_actions_earn_action_id_fkey" FOREIGN KEY ("earn_action_id") REFERENCES "earn_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
