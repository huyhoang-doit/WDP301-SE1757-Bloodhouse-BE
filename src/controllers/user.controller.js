"use strict";

const { OK, CREATED } = require("../configs/success.response");
const asyncHandler = require("../helpers/asyncHandler");
const userService = require("../services/user.service");

class UserController {
  // Admin tạo user mới
  createUser = asyncHandler(async (req, res) => {
    const result = await userService.createUser(req.body);
    new CREATED({
      message: "User created successfully",
      data: result,
    }).send(res);
  });

  // Tìm kiếm người dùng gần vị trí
  findNearbyUsers = asyncHandler(async (req, res) => {
    const { lat, lng, distance, bloodType } = req.query;
    const result = await userService.findNearbyUsers({
      lat,
      lng,
      distance,
      bloodType,
    });
    new OK({
      message: "Nearby users retrieved successfully",
      data: result,
    }).send(res);
  });

  // Điền thông tin nhóm máu
  updateBloodGroup = asyncHandler(async (req, res) => {
    const result = await userService.updateBloodGroup(
      req.user.userId,
      req.body.bloodId
    );
    new OK({
      message: "Blood group updated successfully",
      data: result,
    }).send(res);
  });

  // Cập nhật profile
  updateProfile = asyncHandler(async (req, res) => {
    const result = await userService.updateProfile(req.user.userId, req.body);
    new OK({
      message: "Profile updated successfully",
      data: result,
    }).send(res);
  });

  // Gửi email xác minh
  sendVerificationEmail = asyncHandler(async (req, res) => {
    const result = await userService.sendVerificationEmail(req.user.userId);
    new OK({
      message: "Verification email sent successfully",
      data: result,
    }).send(res);
  });

  // Xác minh tài khoản
  verifyAccount = asyncHandler(async (req, res) => {
    const result = await userService.verifyAccount(
      req.user.userId,
      req.body.OTP
    );
    new OK({
      message: "Account verified successfully",
      data: result,
    }).send(res);
  });

  // Upload CCCD
  uploadCCCD = asyncHandler(async (req, res) => {
    const result = await userService.uploadCCCD(req.user.userId, req.file);
    new OK({
      message: "CCCD uploaded successfully",
      data: result,
    }).send(res);
  });

  // Xác minh tài khoản level 2
  verifyLevel2 = asyncHandler(async (req, res) => {
    const result = await userService.verifyLevel2(req.user.userId, req.body);
    new OK({
      message: "Account verified successfully",
      data: result,
    }).send(res);
  });

  // Đổi mật khẩu
  changePassword = asyncHandler(async (req, res) => {
    const result = await userService.changePassword(req.user.userId, req.body);
    new OK({
      message: "Password changed successfully",
      data: result,
    }).send(res);
  });

  // Cập nhật avatar
  updateAvatar = asyncHandler(async (req, res) => {
    const result = await userService.updateAvatar(
      req.user.userId,
      req.body.avatar
    );
    new OK({
      message: "Avatar updated successfully",
      data: result,
    }).send(res);
  });

  // Lấy thông tin user
  getUserInfo = asyncHandler(async (req, res) => {
    const result = await userService.getUserInfo(req.user.userId, req.user.role);
    new OK({
      message: "User info retrieved successfully",
      data: result,
    }).send(res);
  });

  // Lấy danh sách user
  getUsers = asyncHandler(async (req, res) => {
    const result = await userService.getUsers(req.query);
    new OK({
      message: "Users retrieved successfully",
      data: result,
    }).send(res);
  });

  // Xóa tài khoản
  deleteAccount = asyncHandler(async (req, res) => {
    const result = await userService.deleteAccount(req.user.userId);
    new OK({
      message: "Account deactivated successfully",
      data: result,
    }).send(res);
  });

  // Quên mật khẩu
  forgotPassword = asyncHandler(async (req, res) => {
    const result = await userService.forgotPassword(req.body.email);
    new OK({
      message: "Password reset email sent successfully",
      data: result,
    }).send(res);
  });

  // Đặt lại mật khẩu
  resetPassword = asyncHandler(async (req, res) => {
    const result = await userService.resetPassword(req.body);
    new OK({
      message: "Password reset successfully",
      data: result,
    }).send(res);
  });

  // Cập nhật expo push token
  updateExpoToken = asyncHandler(async (req, res) => {
    const result = await userService.updateExpoToken(
      req.user.userId,
      req.body.expoPushToken
    );
    new OK({
      message: "Expo push token updated successfully",
      data: result,
    }).send(res);
  });
}

module.exports = new UserController();
