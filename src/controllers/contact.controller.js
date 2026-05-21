const prisma = require("../config/prisma");
const asyncHandler = require("../utils/asyncHandler");

// ─────────────────────────────────────────
//  POST /api/contact/submit
// ─────────────────────────────────────────
exports.submitContactForm = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;

  // Optional: Add validation for spam or rate limiting here
  // Optional: Send email notification to admin

  const contactSubmission = await prisma.contactSubmission.create({
    data: {
      name,
      email,
      subject,
      message,
      status: "unread",
    },
  });

  res.status(201).json({
    success: true,
    message: "Contact form submitted successfully",
    data: {
      id: contactSubmission.id,
      name: contactSubmission.name,
      email: contactSubmission.email,
      subject: contactSubmission.subject,
      createdAt: contactSubmission.createdAt,
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/contact/submissions (Admin only)
// ─────────────────────────────────────────
exports.getContactSubmissions = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (status) {
    where.status = status;
  }

  const submissions = await prisma.contactSubmission.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take,
  });

  const total = await prisma.contactSubmission.count({ where });

  res.status(200).json({
    submissions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// ─────────────────────────────────────────
//  GET /api/contact/submissions/:id (Admin only)
// ─────────────────────────────────────────
exports.getContactSubmissionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const submission = await prisma.contactSubmission.findUnique({
    where: { id },
  });

  if (!submission) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Contact submission not found",
      },
    });
  }

  // Mark as read if it was unread
  if (submission.status === "unread") {
    await prisma.contactSubmission.update({
      where: { id },
      data: { status: "read" },
    });
    submission.status = "read";
  }

  res.status(200).json({ submission });
});

// ─────────────────────────────────────────
//  PATCH /api/contact/submissions/:id/status (Admin only)
// ─────────────────────────────────────────
exports.updateSubmissionStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ["unread", "read", "replied", "archived"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: {
        code: "INVALID_STATUS",
        message: "Invalid status. Must be one of: unread, read, replied, archived",
      },
    });
  }

  const submission = await prisma.contactSubmission.findUnique({
    where: { id },
  });

  if (!submission) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Contact submission not found",
      },
    });
  }

  const updated = await prisma.contactSubmission.update({
    where: { id },
    data: { status },
  });

  res.status(200).json({
    success: true,
    message: "Status updated successfully",
    submission: updated,
  });
});

// ─────────────────────────────────────────
//  DELETE /api/contact/submissions/:id (Admin only)
// ─────────────────────────────────────────
exports.deleteContactSubmission = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const submission = await prisma.contactSubmission.findUnique({
    where: { id },
  });

  if (!submission) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Contact submission not found",
      },
    });
  }

  await prisma.contactSubmission.delete({
    where: { id },
  });

  res.status(200).json({
    success: true,
    message: "Contact submission deleted successfully",
  });
});