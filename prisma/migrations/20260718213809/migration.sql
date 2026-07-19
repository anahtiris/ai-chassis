-- CreateTable
CREATE TABLE "app"."analytics_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "metric_key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_snapshot_date_metric_key_key" ON "app"."analytics_snapshots"("snapshot_date", "metric_key");
