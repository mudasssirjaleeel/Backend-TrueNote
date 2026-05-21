const router = require("express").Router();
const { body } = require("express-validator");
const { protect } = require("../middleware/auth");
const validate = require("../middleware/validate");
const contactCtrl = require("../controllers/contact.controller");

// Public route - Submit contact form (no authentication required)
router.post(
  "/submit",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("subject").notEmpty().withMessage("Subject is required"),
    body("message").notEmpty().withMessage("Message is required"),
  ],
  validate,
  contactCtrl.submitContactForm,
);

// All routes below require admin authentication
// You can create an isAdmin middleware if needed
router.use(protect);
// router.use(isAdmin); // Add this middleware if you have it

// GET /api/contact/submissions - List all submissions (Admin only)
router.get("/submissions", contactCtrl.getContactSubmissions);

// GET /api/contact/submissions/:id - Get single submission (Admin only)
router.get("/submissions/:id", contactCtrl.getContactSubmissionById);

// PATCH /api/contact/submissions/:id/status - Update status (Admin only)
router.patch(
  "/submissions/:id/status",
  [
    body("status").notEmpty().withMessage("Status is required"),
  ],
  validate,
  contactCtrl.updateSubmissionStatus,
);

// DELETE /api/contact/submissions/:id - Delete submission (Admin only)
router.delete("/submissions/:id", contactCtrl.deleteContactSubmission);

module.exports = router;