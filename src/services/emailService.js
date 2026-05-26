const nodemailer = require("nodemailer");

// Create transporter
let transporter = null;

// Initialize email transporter
const initEmailTransporter = async () => {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    // Production - Use real SMTP
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log("📧 Email transporter initialized (Production SMTP)");
  } else {
    // Development - Use Ethereal (fake SMTP for testing)
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log("📧 Email transporter initialized (Ethereal test mode)");
    console.log(`   Test email preview: https://ethereal.email/messages`);
  }

  return transporter;
};

// ─────────────────────────────────────────
//  Send Staff Invitation Email
// ─────────────────────────────────────────
const sendStaffInvitationEmail = async ({
  to,
  name,
  email,
  tempPassword,
  loginUrl,
  role,
  inviterName,
}) => {
  try {
    const transporter = await initEmailTransporter();

    const roleLabels = {
      super_admin: "Super Administrator",
      manager: "Store Manager",
      barista: "Barista",
      counter: "Counter Staff",
      rider: "Delivery Rider",
    };

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Truenote Coffee" <noreply@truenote.com>',
      to: to,
      subject: "Welcome to Truenote Coffee - Your Admin Access",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #d97706;">Welcome to Truenote Coffee</h2>
            <p style="color: #666;">Admin Portal Access</p>
          </div>
          
          <p>Hi ${name || "there"},</p>
          
          <p><strong>${inviterName || "An administrator"}</strong> has invited you to join the Truenote Coffee admin team as a <strong style="color: #d97706;">${roleLabels[role] || role}</strong>.</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Your login credentials:</strong></p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Temporary Password:</strong> 
              <code style="background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-weight: bold;">${tempPassword}</code>
            </p>
          </div>

          <a href="${loginUrl}" 
             style="display: inline-block; background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 10px 0;">
            Login to Admin Dashboard
          </a>

          <p style="margin-top: 20px; color: #e74c3c; font-size: 14px;">
            ⚠️ For security, please change your password after your first login.
          </p>

          <hr style="margin: 30px 0 20px; border: none; border-top: 1px solid #eee;">
          
          <p style="color: #777; font-size: 12px; margin: 0;">
            Best regards,<br>
            <strong>Truenote Coffee Team</strong>
          </p>
        </div>
      `,
    });

    console.log(`✅ Staff invitation email sent to ${to}`);
    if (!process.env.SMTP_HOST) {
      console.log(`   📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Failed to send staff invitation email:", error.message);
    return false;
  }
};

// ─────────────────────────────────────────
//  Send Test Email
// ─────────────────────────────────────────
const sendTestEmail = async (to) => {
  try {
    const transporter = await initEmailTransporter();

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Truenote Coffee" <noreply@truenote.com>',
      to: to,
      subject: "Truenote Coffee - Test Email",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d97706;">Test Email from Truenote Coffee</h2>
          <p>This is a test email from your Truenote Coffee backend.</p>
          <p>If you received this, your email configuration is working correctly!</p>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Truenote Coffee - Admin System</p>
        </div>
      `,
    });

    console.log(`✅ Test email sent to ${to}`);
    if (!process.env.SMTP_HOST) {
      console.log(`   📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      return { success: true, previewUrl: nodemailer.getTestMessageUrl(info) };
    }
    return { success: true };
  } catch (error) {
    console.error("❌ Failed to send test email:", error.message);
    return { success: false, error: error.message };
  }
};

// ─────────────────────────────────────────
//  Send Welcome Email (NEW)
// ─────────────────────────────────────────
const sendWelcomeEmail = async ({ to, name }) => {
  try {
    const transporter = await initEmailTransporter();

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Truenote Coffee" <noreply@truenote.com>',
      to: to,
      subject: "Welcome to Truenote Coffee! ☕",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #d97706; margin: 0;">Welcome to Truenote Coffee</h1>
            <p style="color: #666; margin: 5px 0 0;">Freshly roasted, delivered to your door</p>
          </div>

          <p>Hi ${name},</p>
          <p>Welcome to Truenote Coffee! We're so excited to have you on board. ☕</p>
          <p>You can now browse our coffee beans, place orders, and manage your subscriptions.</p>

          <a href="${process.env.CLIENT_URL || "http://localhost:3000"}"
             style="display: block; background-color: #d97706; color: white; text-align: center; padding: 12px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Start Shopping
          </a>

          <hr style="margin: 30px 0 20px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            Truenote Coffee — Freshly roasted, ethically sourced.<br>
            Questions? Contact us at support@truenote.com
          </p>
        </div>
      `,
    });

    console.log(`✅ Welcome email sent to ${to}`);
    if (!process.env.SMTP_HOST) {
      console.log(`   📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Failed to send welcome email:", error.message);
    return false;
  }
};

// ─────────────────────────────────────────
//  Send Password Reset Email (NEW)
// ─────────────────────────────────────────
const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  try {
    const transporter = await initEmailTransporter();

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Truenote Coffee" <noreply@truenote.com>',
      to: to,
      subject: "Reset Your Password — Truenote Coffee",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #d97706; margin: 0;">Truenote Coffee</h1>
            <p style="color: #666; margin: 5px 0 0;">Password Reset Request</p>
          </div>

          <p>Hi ${name},</p>
          <p>We received a request to reset your password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>

          <a href="${resetUrl}"
             style="display: block; background-color: #d97706; color: white; text-align: center; padding: 12px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Reset My Password
          </a>

          <p style="color: #999; font-size: 13px;">
            If you didn't request a password reset, you can safely ignore this email. Your password won't change.
          </p>

          <hr style="margin: 30px 0 20px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            Truenote Coffee — support@truenote.com
          </p>
        </div>
      `,
    });

    console.log(`✅ Password reset email sent to ${to}`);
    if (!process.env.SMTP_HOST) {
      console.log(`   📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Failed to send password reset email:", error.message);
    return false;
  }
};

// ─────────────────────────────────────────
//  Send Order Confirmation Email
// ─────────────────────────────────────────
const sendOrderConfirmationEmail = async ({ to, name, orderNumber, total }) => {
  try {
    const transporter = await initEmailTransporter();

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Truenote Coffee" <orders@truenote.com>',
      to: to,
      subject: `Order Received #${orderNumber} — Truenote Coffee`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #d97706; margin: 0;">Truenote Coffee</h1>
            <p style="color: #666; margin: 5px 0 0;">Freshly roasted coffee delivered to your door</p>
          </div>

          <div style="text-align: center; padding: 20px; background-color: #d9770610; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #d97706; margin: 0;">Order Received! ☕</h2>
            <p style="color: #333; margin: 10px 0 0;">Thank you for your order. We've received it and it's being reviewed.</p>
          </div>

          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Order Number:</strong> #${orderNumber}</p>
            <p style="margin: 5px 0;"><strong>Total Amount:</strong> $${total.toFixed(2)}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #d97706;">Pending Confirmation</span></p>
          </div>

          <p>You'll receive another email once your order is confirmed and being prepared.</p>

          <a href="${process.env.CLIENT_URL || "http://localhost:3000"}/order_history"
             style="display: block; background-color: #d97706; color: white; text-align: center; padding: 12px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            View My Orders
          </a>

          <hr style="margin: 30px 0 20px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            Truenote Coffee — Freshly roasted, ethically sourced.<br>
            Questions? Contact us at support@truenote.com
          </p>
        </div>
      `,
    });

    console.log(`✅ Order confirmation email sent to ${to}`);
    if (!process.env.SMTP_HOST) {
      console.log(`   📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Failed to send order confirmation email:", error.message);
    return false;
  }
};

// ─────────────────────────────────────────
//  Send Order Status Email
// ─────────────────────────────────────────
const sendOrderStatusEmail = async ({
  to,
  name,
  orderNumber,
  status,
  total,
  orderId,
}) => {
  try {
    const transporter = await initEmailTransporter();

    const statusMessages = {
      confirmed: {
        title: "Order Confirmed",
        message: "Your order has been confirmed and is being prepared.",
        color: "#10B981",
      },
      preparing: {
        title: "Order Being Prepared",
        message: "Your order is now being prepared by our team.",
        color: "#F59E0B",
      },
      ready: {
        title: "Order Ready for Pickup",
        message: "Your order is ready for pickup. Come grab your coffee!",
        color: "#3B82F6",
      },
      out_for_delivery: {
        title: "Order Out for Delivery",
        message: "Your order is out for delivery and will arrive soon.",
        color: "#8B5CF6",
      },
      delivered: {
        title: "Order Delivered",
        message: "Your order has been delivered. Enjoy your coffee!",
        color: "#10B981",
      },
      cancelled: {
        title: "Order Cancelled",
        message: "Your order has been cancelled.",
        color: "#EF4444",
      },
    };

    const statusInfo = statusMessages[status] || {
      title: "Order Update",
      message: `Your order status has been updated to ${status}.`,
      color: "#6B7280",
    };

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Truenote Coffee" <orders@truenote.com>',
      to: to,
      subject: `${statusInfo.title} - Order #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #d97706; margin: 0;">Truenote Coffee</h1>
            <p style="color: #666; margin: 5px 0 0;">Freshly roasted coffee delivered to your door</p>
          </div>
          
          <div style="text-align: center; padding: 20px; background-color: ${statusInfo.color}10; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: ${statusInfo.color}; margin: 0;">${statusInfo.title}</h2>
            <p style="color: #333; margin: 10px 0 0;">${statusInfo.message}</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Order Number:</strong> #${orderNumber}</p>
            <p style="margin: 5px 0;"><strong>Total Amount:</strong> $${total.toFixed(2)}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${statusInfo.color};">${statusInfo.title}</span></p>
          </div>
          
          <a href="${process.env.CLIENT_URL || "http://localhost:3000"}/order_history" 
             style="display: block; background-color: #d97706; color: white; text-align: center; padding: 12px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            View Order Details
          </a>
          
          <hr style="margin: 30px 0 20px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            Truenote Coffee — Freshly roasted, ethically sourced.<br>
            Questions? Contact us at support@truenote.com
          </p>
        </div>
      `,
    });

    console.log(`✅ Order status email sent to ${to} for status: ${status}`);
    if (!process.env.SMTP_HOST) {
      console.log(`   📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Failed to send order status email:", error.message);
    return false;
  }
};

// ─────────────────────────────────────────
//  Send Subscription Renewal Email
// ─────────────────────────────────────────
const sendSubscriptionRenewalEmail = async ({
  to,
  name,
  subscriptionNumber,
  nextDeliveryDate,
  price,
}) => {
  try {
    const transporter = await initEmailTransporter();

    const info = await transporter.sendMail({
      from:
        process.env.SMTP_FROM ||
        '"Truenote Coffee" <subscriptions@truenote.com>',
      to: to,
      subject: `Subscription Renewed - #${subscriptionNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #d97706; margin: 0;">Truenote Coffee</h1>
            <p style="color: #666; margin: 5px 0 0;">Your coffee subscription</p>
          </div>
          
          <div style="text-align: center; padding: 20px; background-color: #10B98110; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #10B981; margin: 0;">Subscription Renewed! 🔄</h2>
            <p style="color: #333; margin: 10px 0 0;">Your subscription has been successfully renewed.</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Subscription:</strong> #${subscriptionNumber}</p>
            <p style="margin: 5px 0;"><strong>Next Delivery Date:</strong> ${new Date(nextDeliveryDate).toLocaleDateString()}</p>
            <p style="margin: 5px 0;"><strong>Amount Charged:</strong> $${price.toFixed(2)}</p>
          </div>
          
          <a href="${process.env.CLIENT_URL || "http://localhost:3000"}/my_subscription" 
             style="display: block; background-color: #d97706; color: white; text-align: center; padding: 12px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Manage Subscription
          </a>
          
          <hr style="margin: 30px 0 20px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            Truenote Coffee — Freshly roasted, delivered to your door.<br>
            Questions? Contact us at support@truenote.com
          </p>
        </div>
      `,
    });

    console.log(`✅ Subscription renewal email sent to ${to}`);
    if (!process.env.SMTP_HOST) {
      console.log(`   📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Failed to send subscription renewal email:", error.message);
    return false;
  }
};

// ─────────────────────────────────────────
//  Send Subscription Payment Failed Email
// ─────────────────────────────────────────
const sendSubscriptionPaymentFailedEmail = async ({
  to,
  name,
  subscriptionNumber,
  price,
}) => {
  try {
    const transporter = await initEmailTransporter();

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Truenote Coffee" <billing@truenote.com>',
      to: to,
      subject: `Payment Failed - Subscription #${subscriptionNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #d97706; margin: 0;">Truenote Coffee</h1>
            <p style="color: #666; margin: 5px 0 0;">Your coffee subscription</p>
          </div>
          
          <div style="text-align: center; padding: 20px; background-color: #EF444410; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #EF4444; margin: 0;">Payment Failed ⚠️</h2>
            <p style="color: #333; margin: 10px 0 0;">We couldn't process your payment.</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Subscription:</strong> #${subscriptionNumber}</p>
            <p style="margin: 5px 0;"><strong>Amount Due:</strong> $${price.toFixed(2)}</p>
          </div>
          
          <p>Please update your payment method to continue receiving your coffee deliveries.</p>
          
          <a href="${process.env.CLIENT_URL || "http://localhost:3000"}/my_subscription" 
             style="display: block; background-color: #d97706; color: white; text-align: center; padding: 12px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Update Payment Method
          </a>
          
          <hr style="margin: 30px 0 20px;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            Truenote Coffee — Freshly roasted, delivered to your door.<br>
            Questions? Contact us at support@truenote.com
          </p>
        </div>
      `,
    });

    console.log(`✅ Subscription payment failed email sent to ${to}`);
    if (!process.env.SMTP_HOST) {
      console.log(`   📧 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return true;
  } catch (error) {
    console.error("❌ Failed to send payment failed email:", error.message);
    return false;
  }
};

module.exports = {
  initEmailTransporter,
  sendStaffInvitationEmail,
  sendTestEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  sendSubscriptionRenewalEmail,
  sendSubscriptionPaymentFailedEmail,
};
