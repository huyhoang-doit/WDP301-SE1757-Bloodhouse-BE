"use strict";

const JWT = require("jsonwebtoken");
const { createTokenPair } = require("./jwt");
const { HEADER } = require("../constants/enum");
const FacilityStaff = require("../models/facilityStaff.model");

// Hàm kiểm tra xác thực
const checkAuth = async (req, res, next) => {
  try {
    // Step 1: Lấy accessToken từ header
    const authHeader = req.headers[HEADER.AUTHORIZATION];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(400).json({
        status: "error",
        code: 400,
        message: "No access token provided or invalid format",
      });
    }
    const accessToken = authHeader.split(" ")[1];

    // Step 2: Lấy refreshToken từ header (nếu có)
    const refreshToken = req.headers[HEADER.REFRESH_TOKEN];

    // Step 3: Xác minh accessToken
    const accessTokenKey = process.env.ACCESS_TOKEN_SECRET_SIGNATURE;
    if (!accessTokenKey) {
      return res.status(500).json({
        status: "error",
        code: 500,
        message: "Access token secret key not defined",
      });
    }

    try {
      // Decode accessToken nếu hợp lệ
      const decoded = JWT.verify(accessToken, accessTokenKey);
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        staffId: decoded.staffId,
        facilityId: decoded.facilityId,
      };
      next();
    } catch (error) {
      // Nếu accessToken hết hạn và có refreshToken
      if (error.name === "TokenExpiredError" && refreshToken) {
        const newTokens = await refreshTokenHandler(refreshToken);
        req.user = newTokens.user;
        res.set("x-access-token", newTokens.accessToken);
        res.set("x-refresh-token", newTokens.refreshToken);
        next();
      } else {
        return res.status(401).json({
          status: "error",
          code: 401,
          message: "Invalid or expired access token",
        });
      }
    }
  } catch (error) {
    console.error("checkAuth error:", error.message);
    return res.status(error.code || 401).json({
      status: "error",
      code: error.code || 401,
      message: error.message || "Authentication failed",
    });
  }
};

// Hàm xử lý làm mới token
const refreshTokenHandler = async (refreshToken) => {
  try {
    const refreshTokenKey = process.env.REFRESH_TOKEN_SECRET_SIGNATURE;
    if (!refreshTokenKey) {
      return {
        status: "error",
        code: 500,
        message: "Refresh token secret key not defined",
      };
    }

    const decodedRefresh = JWT.verify(refreshToken, refreshTokenKey);

    const newTokens = await createTokenPair(
      {
        userId: decodedRefresh.userId,
        email: decodedRefresh.email,
        role: decodedRefresh.role,
      },
      process.env.ACCESS_TOKEN_SECRET_SIGNATURE,
      refreshTokenKey
    );

    return {
      user: {
        userId: decodedRefresh.userId,
        email: decodedRefresh.email,
        role: decodedRefresh.role,
      },
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    };
  } catch (error) {
    console.error("refreshTokenHandler error:", error.message);
    return {
      status: "error",
      code: 401,
      message: error.message || "Invalid or expired refresh token",
    };
  }
};

// Hàm kiểm tra role
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(403).json({
          status: "error",
          code: 403,
          message: "User information or role not found",
        });
      }

      const userRole = req.user.role;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          status: "error",
          code: 403,
          message: `User does not have permission. Required roles: ${allowedRoles.join(
            ", "
          )}. Your role: ${userRole}`,
        });
      }

      next();
    } catch (error) {
      return res.status(403).json({
        status: "error",
        code: 403,
        message: `User does not have permission. Required roles: ${allowedRoles.join(
          ", "
        )}. Your role: ${req.user?.role || "unknown"}`,
      });
    }
  };
};

// Hàm kiểm tra staff có thuộc facility không
const checkStaff = (allowedPositions) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.staffId || !req.user.facilityId) {
        return res.status(403).json({
          status: "error",
          code: 403,
          message: "Staff information not found",
        });
      }

      const staff = await FacilityStaff.findOne({
        _id: req.user.staffId,
        facilityId: req.user.facilityId,
        isDeleted: false
      });

      if (!staff) {
        return res.status(403).json({
          status: "error",
          code: 403,
          message: "Staff not found or not assigned to this facility",
        });
      }

      if (!allowedPositions.includes(staff.position)) {
        return res.status(403).json({
          status: "error",
          code: 403,
          message: `Staff does not have required position. Required positions: ${allowedPositions.join(
            ", "
          )}. Your position: ${staff.position}`,
        });
      }

      // Thêm thông tin staff vào request để sử dụng ở các middleware tiếp theo
      req.staff = staff;
      next();
    } catch (error) {
      return res.status(403).json({
        status: "error",
        code: 403,
        message: error.message || "Staff verification failed",
      });
    }
  };
};

module.exports = { checkAuth, checkRole, checkStaff };
