
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies.adminToken;

    if (!token) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.adminId).select(
      "_id email role"
    );

    if (!admin) {
      return res.status(401).json({
        message: "Admin account not found",
      });
    }

    req.admin = admin;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired session",
    });
  }
};

module.exports = authMiddleware;
