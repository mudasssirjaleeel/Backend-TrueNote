// utils/otp.js
const crypto = require("crypto");

const generateOtp = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const isOtpExpired = (expiresAt) => {
  return new Date() > new Date(expiresAt);
};

module.exports = { generateOtp, isOtpExpired };