const router = require("express").Router();
const { protect, adminOnly } = require("../middleware/auth");
const reportsCtrl = require("../controllers/reports.controller");

// All report routes require admin authentication
router.use(protect, adminOnly);

// GET /api/reports/sales-summary - Sales summary report
router.get("/sales-summary", reportsCtrl.getSalesSummary);

// GET /api/reports/best-sellers - Best sellers report
router.get("/best-sellers", reportsCtrl.getBestSellers);

// GET /api/reports/hourly-heatmap - Hourly heatmap report
router.get("/hourly-heatmap", reportsCtrl.getHourlyHeatmap);

// GET /api/reports/delivery-performance - Delivery performance report
router.get("/delivery-performance", reportsCtrl.getDeliveryPerformance);

// GET /api/reports/customer-ltv - Customer lifetime value report
router.get("/customer-ltv", reportsCtrl.getCustomerLTV);

module.exports = router;