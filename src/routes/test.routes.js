const router = require("express").Router();
const { protect, adminOnly } = require("../middleware/auth");
const { sendTestEmail } = require("../services/emailService");

router.post("/test-email", protect, adminOnly, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const result = await sendTestEmail(email);

  if (result.success) {
    res.json({
      success: true,
      message: "Test email sent!",
      previewUrl: result.previewUrl,
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error,
    });
  }
});

module.exports = router;
