"use strict";

const userModel = require("../models/user.model");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { BadRequestError, NotFoundError } = require("../configs/error.response");
const { getInfoData } = require("../utils");
const {
  USER_STATUS,
  SEX,
  USER_ROLE,
  BLOOD_DONATION_STATUS,
  STAFF_POSITION,
} = require("../constants/enum");
const crypto = require("crypto");
const mailService = require("./mail.service");
const { getPaginatedData } = require("../helpers/mongooseHelper");
const FPT_AI_OCR = require("../helpers/fptOcrHelper");
const bloodDonationModel = require("../models/bloodDonation.model");
const { validatePhone, validateEmail, validateIdCard } = require("../utils/validation");
const facilityStaffService = require("./facilityStaff.service");
const facilityStaffModel = require("../models/facilityStaff.model");

class UserService {
  // Admin xem chi tiết thông tin user
  adminGetUserDetail = async (userId) => {
    // Tìm user và populate bloodId
    const user = await userModel
      .findById(userId)
      .select("-password -verifyOTP -verifyExpires -resetPasswordToken -resetPasswordExpires")
      .populate("bloodId", "name type");

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Lấy thông tin facility staff nếu user là staff
    let facilityStaffInfo = null;
    const staffRoles = [USER_ROLE.MANAGER, USER_ROLE.DOCTOR, USER_ROLE.NURSE, USER_ROLE.TRANSPORTER];
    
    if (staffRoles.includes(user.role)) {
      facilityStaffInfo = await facilityStaffModel
        .findOne({
          userId: user._id,
          isDeleted: { $ne: true }
        })
        .populate("facilityId", "name address contactPhone contactEmail");
    }

    // Lấy thống kê hiến máu nếu là member
    let donationStats = null;
    if (user.role === USER_ROLE.MEMBER) {
      donationStats = await this.getDonationStats(userId);
    }

    // Tạo response object
    const userDetail = {
      ...user.toObject(),
      facilityStaffInfo: facilityStaffInfo ? {
        position: facilityStaffInfo.position,
        assignedAt: facilityStaffInfo.assignedAt,
        facility: facilityStaffInfo.facilityId ? {
          id: facilityStaffInfo.facilityId._id,
          name: facilityStaffInfo.facilityId.name,
          address: facilityStaffInfo.facilityId.address,
          contactPhone: facilityStaffInfo.facilityId.contactPhone,
          contactEmail: facilityStaffInfo.facilityId.contactEmail,
        } : null
      } : null,
      donationStats
    };

    return userDetail;
  };

  // Admin cập nhật thông tin user
  adminUpdateUser = async (
    userId,
    {
      fullName,
      email,
      password,
      role,
      sex,
      yob,
      phone,
      address,
      idCard,
      bloodId,
      isAvailable,
      status,
      profileLevel,
    }
  ) => {
    // Check if user exists
    const user = await userModel.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Validate email if changed
    if (email && email !== user.email) {
      if (!validateEmail(email)) {
        throw new BadRequestError("Email is invalid");
      }
      const existingEmail = await userModel.findOne({
        email: email.trim().toLowerCase(),
        _id: { $ne: userId },
      });
      if (existingEmail) {
        throw new BadRequestError("Email already exists");
      }
    }

    // Validate phone if changed
    if (phone && phone !== user.phone) {
      if (!validatePhone(phone)) {
        throw new BadRequestError("Phone number is invalid");
      }
      const existingPhone = await userModel.findOne({
        phone: phone.trim(),
        _id: { $ne: userId },
      });
      if (existingPhone) {
        throw new BadRequestError("Phone number already exists");
      }
    }

    // Validate idCard if changed
    if (idCard && idCard !== user.idCard) {
      if (!validateIdCard(idCard)) {
        throw new BadRequestError("ID card number is invalid");
      }
      const existingIdCard = await userModel.findOne({
        idCard: idCard.trim(),
        _id: { $ne: userId },
      });
      if (existingIdCard) {
        throw new BadRequestError("ID card number already exists");
      }
    }

    // Validate role if changed
    if (role && !Object.values(USER_ROLE).includes(role)) {
      throw new BadRequestError(
        `Role must be one of: ${Object.values(USER_ROLE).join(", ")}`
      );
    }

    // Validate sex if changed
    if (sex && !Object.values(SEX).includes(sex)) {
      throw new BadRequestError(
        `Sex must be one of: ${Object.values(SEX).join(", ")}`
      );
    }

    // Validate yob if changed
    if (yob && isNaN(Date.parse(yob))) {
      throw new BadRequestError("Year of birth (yob) must be a valid date");
    }

    // Validate status if changed
    if (status && !Object.values(USER_STATUS).includes(status)) {
      throw new BadRequestError(
        `Status must be one of: ${Object.values(USER_STATUS).join(", ")}`
      );
    }

    // Create update object with only changed fields
    const updateData = {
      ...(fullName && { fullName: fullName.trim() }),
      ...(email && { email: email.trim().toLowerCase() }),
      ...(role && { role }),
      ...(sex && { sex }),
      ...(yob && { yob: new Date(yob) }),
      ...(phone && { phone: phone.trim() }),
      ...(address && { address: address.trim() }),
      ...(idCard && { idCard: idCard.trim() }),
      ...(bloodId && { bloodId }),
      ...(typeof isAvailable !== 'undefined' && { isAvailable }),
      ...(status && { status }),
      ...(profileLevel && { profileLevel }),
    };

    // Hash password if provided
    if (password) {
      if (password.length < 6) {
        throw new BadRequestError("Password must be at least 6 characters");
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Xử lý thay đổi role và facility staff
    if (role && role !== user.role) {
      const staffRoleMapping = {
        [USER_ROLE.MANAGER]: STAFF_POSITION.MANAGER,
        [USER_ROLE.DOCTOR]: STAFF_POSITION.DOCTOR,
        [USER_ROLE.NURSE]: STAFF_POSITION.NURSE,
        [USER_ROLE.TRANSPORTER]: STAFF_POSITION.TRANSPORTER,
      };

      // Nếu role cũ là staff role, xóa facility staff cũ
      if (staffRoleMapping[user.role]) {
        const existingStaff = await facilityStaffModel.findOne({
          userId,
          isDeleted: { $ne: true }
        });
        if (existingStaff) {
          await facilityStaffService.deleteFacilityStaff(existingStaff._id);
        }
      }

      // Nếu role mới là staff role, tạo facility staff mới
      if (staffRoleMapping[role]) {
        await facilityStaffService.createFacilityStaff({
          userId,
          position: staffRoleMapping[role],
        });
      }
    }

    // Update user
    const updatedUser = await userModel.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select("-password -verifyOTP -verifyExpires -resetPasswordToken -resetPasswordExpires");

    return getInfoData({
      fields: [
        "_id",
        "fullName",
        "email",
        "role",
        "sex",
        "yob",
        "phone",
        "address",
        "idCard",
        "bloodId",
        "isAvailable",
        "status",
        "profileLevel",
        "avatar",
      ],
      object: updatedUser,
    });
  };

  // Admin tạo user mới
  createUser = async ({
    fullName,
    email,
    password,
    role,
    sex,
    yob,
    phone,
    address,
    idCard,
    bloodId,
    isAvailable = true,
  }) => {
    // Validate required fields
    if (!fullName || typeof fullName !== "string" || fullName.trim() === "") {
      throw new BadRequestError(
        "Full name is required and must be a non-empty string"
      );
    }

    if (!email || !validateEmail(email)) {
      throw new BadRequestError("Email is required and must be valid");
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      throw new BadRequestError(
        "Password is required and must be at least 6 characters"
      );
    }

    if (!role || !Object.values(USER_ROLE).includes(role)) {
      throw new BadRequestError(
        `Role must be one of: ${Object.values(USER_ROLE).join(", ")}`
      );
    }

    // Validate optional fields
    if (sex && !Object.values(SEX).includes(sex)) {
      throw new BadRequestError(
        `Sex must be one of: ${Object.values(SEX).join(", ")}`
      );
    }

    if (yob && isNaN(Date.parse(yob))) {
      throw new BadRequestError("Year of birth (yob) must be a valid date");
    }

    if (phone && !validatePhone(phone)) {
      throw new BadRequestError("Phone number is invalid");
    }

    if (idCard && !validateIdCard(idCard)) {
      throw new BadRequestError("Id card number is invalid");
    }

    // Check if email, phone, idCard exists
    const existingUser = await userModel.findOne({
      email: email.trim().toLowerCase(),
    });
    if (existingUser) {
      throw new BadRequestError("Email already exists");
    }

    if (phone) {
      const existingPhone = await userModel.findOne({ phone: phone.trim() });
      if (existingPhone) {
        throw new BadRequestError("Phone number already exists");
      }
    }

    if (idCard) {
      const existingIdCard = await userModel.findOne({ idCard: idCard.trim() });
      if (existingIdCard) {
        throw new BadRequestError("Id card number already exists");
      }
    }

    // Hash password and create new user
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await userModel.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password: passwordHash,
      role,
      sex,
      yob: yob ? new Date(yob) : undefined,
      phone: phone ? phone.trim() : undefined,
      address: address ? address.trim() : undefined,
      idCard: idCard ? idCard.trim() : undefined,
      bloodId,
      isAvailable,
      status: USER_STATUS.ACTIVE, // Admin created accounts are automatically verified
      profileLevel: 2, // Admin created accounts start at level 2
    });

    // Tự động tạo facility staff cho các role tương ứng
    const staffRoleMapping = {
      [USER_ROLE.MANAGER]: STAFF_POSITION.MANAGER,
      [USER_ROLE.DOCTOR]: STAFF_POSITION.DOCTOR,
      [USER_ROLE.NURSE]: STAFF_POSITION.NURSE,
      [USER_ROLE.TRANSPORTER]: STAFF_POSITION.TRANSPORTER,
    };

    if (staffRoleMapping[role]) {
      await facilityStaffService.createFacilityStaff({
        userId: newUser._id,
        position: staffRoleMapping[role],
      });
    }

    return getInfoData({
      fields: [
        "_id",
        "fullName",
        "email",
        "role",
        "sex",
        "yob",
        "phone",
        "address",
        "idCard",
        "bloodId",
        "isAvailable",
        "status",
        "profileLevel",
      ],
      object: newUser,
    });
  };

  // Tìm kiếm người dùng gần vị trí
  findNearbyUsers = async ({ lat, lng, distance, bloodType }) => {
    const maxDistance = parseFloat(distance) * 1000; // Chuyển km thành mét
    const query = {
      isAvailable: true,
      status: USER_STATUS.ACTIVE,
    };

    // Nếu có bloodType, thêm điều kiện lọc theo bloodId dựa trên type của BloodGroup
    if (bloodType) {
      const bloodGroup = await userModel.db
        .collection("BloodGroups")
        .findOne({ type: bloodType });
      if (!bloodGroup) {
        throw new BadRequestError("Invalid blood type");
      }
      query.bloodId = bloodGroup._id;
    }

    const users = await userModel
      .aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)],
            },
            distanceField: "distance", // Thêm trường distance (mét)
            maxDistance: maxDistance,
            spherical: true,
            query,
          },
        },
        {
          $lookup: {
            from: "BloodGroups",
            localField: "bloodId",
            foreignField: "_id",
            as: "bloodGroup",
          },
        },
        {
          $unwind: { path: "$bloodGroup", preserveNullAndEmptyArrays: true },
        },
        {
          $project: {
            _id: 1,
            fullName: 1,
            email: 1,
            phone: 1,
            bloodId: 1,
            "bloodGroup.type": 1,
            location: 1,
            isAvailable: 1,
            distance: { $divide: ["$distance", 1000] }, // Chuyển mét thành km
          },
        },
      ])
      .exec();

    return users.map((user) =>
      getInfoData({
        fields: [
          "_id",
          "fullName",
          "email",
          "phone",
          "bloodId",
          "bloodGroup",
          "location",
          "isAvailable",
          "distance",
        ],
        object: user,
      })
    );
  };

  // Điền thông tin nhóm máu
  updateBloodGroup = async (userId, bloodId) => {
    const user = await userModel
      .findByIdAndUpdate(userId, { bloodId }, { new: true })
      .select("_id fullName email bloodId avatar");
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return getInfoData({
      fields: ["_id", "fullName", "email", "bloodId", "avatar"],
      object: user,
    });
  };

  // Cập nhật profile
  updateProfile = async (userId, profileData) => {
    const allowedFields = [
      "fullName",
      "phone",
      "address",
      "sex",
      "yob",
      "isAvailable",
    ];
    const updateData = Object.keys(profileData)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = profileData[key];
        return obj;
      }, {});

    // Cập nhật location nếu có lat và lng
    if (updateData.lat && updateData.lng) {
      updateData.location = {
        type: "Point",
        coordinates: [parseFloat(updateData.lng), parseFloat(updateData.lat)],
      };
      delete updateData.lat;
      delete updateData.lng;
    }

    const user = await userModel
      .findByIdAndUpdate(userId, updateData, { new: true })
      .select(
        "_id fullName email phone street city country location sex yob isAvailable"
      );
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return getInfoData({
      fields: [
        "_id",
        "fullName",
        "email",
        "phone",
        "address",
        "location",
        "sex",
        "yob",
        "isAvailable",
        "avatar",
        "profileLevel",
        "idCard",
        "address",
      ],
      object: user,
    });
  };

  // Gửi email xác minh
  sendVerificationEmail = async (userId) => {
    const user = await userModel.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    if (user.status === USER_STATUS.VERIFIED) {
      throw new BadRequestError("User already verified");
    }

    const verifyOTP = crypto.randomInt(100000, 999999).toString();
    const hashOTP = await bcrypt.hash(verifyOTP, 10);
    const verifyExpires = Date.now() + 3600000;
    await userModel.findByIdAndUpdate(userId, {
      verifyOTP: hashOTP,
      verifyExpires,
    });

    return mailService.sendVerificationEmail(user.email, verifyOTP);
  };

  // Xác minh tài khoản
  verifyAccount = async (userId, verifyOTP) => {
    const user = await userModel.findOne({
      _id: userId,
    });
    if (!user) {
      throw new BadRequestError("User not found or inactive");
    }

    if (user.status === USER_STATUS.VERIFIED) {
      throw new BadRequestError("User already verified");
    }

    // Kiểm tra thời gian hết hạn OTP
    if (!user.verifyExpires || user.verifyExpires < new Date()) {
      throw new BadRequestError("OTP has expired");
    }

    // So sánh OTP nhập vào với OTP hash trong DB
    const isValidOTP = await bcrypt.compare(verifyOTP, user.verifyOTP);
    if (!isValidOTP) {
      throw new BadRequestError("Invalid OTP");
    }

    // Cập nhật trạng thái verified và xóa OTP
    user.status = USER_STATUS.VERIFIED;
    user.verifyOTP = null;
    user.verifyExpires = null;
    await user.save();

    return getInfoData({
      fields: [
        "_id",
        "fullName",
        "email",
        "isVerified",
        "status",
        "avatar",
        "profileLevel",
        "role",
        "idCard",
        "address",
        "phone",
        "bloodId",
        "sex",
        "yob",
      ],
      object: user,
    });
  };

  // Upload CCCD
  uploadCCCD = async (userId, file) => {
    const user = await userModel.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // 2. Kiểm tra file
    if (!file) throw new BadRequestError("CCCD image is required");
    const validTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!validTypes.includes(file.mimetype))
      throw new BadRequestError("Invalid file type (JPEG/PNG only)");

    // 3. Gọi OCR (FPT AI) – lấy dữ liệu CCCD
    let ocrData;
    try {
      ocrData = await FPT_AI_OCR.extractCCCD(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      // ocrData = { idCard, fullName, dob, address, sex }
    } catch (err) {
      throw new BadRequestError(
        "Cannot read CCCD, please upload clearer image"
      );
    }

    return ocrData;
  };

  // Xác minh tài khoản level 2
  verifyLevel2 = async (userId, verifyData) => {
    console.log(verifyData);
    const user = await userModel.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    if (user.profileLevel !== 1) {
      throw new BadRequestError("User is not at level 1");
    }
    if (verifyData.sex === "Nam") {
      user.sex = SEX.MALE;
    } else {
      user.sex = SEX.FEMALE;
    }
    user.idCard = verifyData.idCard;
    user.address = verifyData.address;
    user.phone = verifyData.phone;
    user.bloodId = verifyData.bloodId;
    user.yob = verifyData.yob;
    user.fullName = verifyData.fullName;
    user.profileLevel = 2;

    await user.save();
    return getInfoData({
      fields: [
        "_id",
        "idCard",
        "fullName",
        "email",
        "address",
        "phone",
        "bloodId",
        "sex",
        "yob",
        "profileLevel",
        "role",
        "avatar",
      ],
      object: user,
    });
  };

  // Đổi mật khẩu
  changePassword = async (userId, { oldPassword, newPassword }) => {
    const user = await userModel.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new BadRequestError("Incorrect old password");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await userModel.findByIdAndUpdate(userId, { password: passwordHash });
    return { message: "Password changed successfully" };
  };

  // Cập nhật avatar
  updateAvatar = async (userId, avatarUrl) => {
    const user = await userModel
      .findByIdAndUpdate(userId, { avatar: avatarUrl }, { new: true })
      .select("_id fullName email avatar");
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return getInfoData({
      fields: ["_id", "fullName", "email", "avatar"],
      object: user,
    });
  };

  // Lấy thông tin thống kê hiến máu của user
  getDonationStats = async (userId) => {
    const completedDonations = await bloodDonationModel.countDocuments({
      userId,
      status: BLOOD_DONATION_STATUS.COMPLETED,
    });

    const latestDonation = await bloodDonationModel
      .findOne({
        userId,
        status: BLOOD_DONATION_STATUS.COMPLETED,
      })
      .sort({ donationDate: -1 });

    return {
      completedDonations,
      latestDonationDate: latestDonation?.donationDate || null,
    };
  };

  getUserInfo = async (userId, role) => {
    const user = await userModel
      .findById(userId)
      .select(
        "_id fullName profileLevel address email phone street city country location sex yob bloodId avatar isAvailable isVerified status idCard"
      )
      .populate("bloodId", "name");
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Get donation stats if user is a member
    let donationStats = null;
    if (role === USER_ROLE.MEMBER) {
      donationStats = await this.getDonationStats(userId);
    }

    const userInfo = getInfoData({
      fields: [
        "_id",
        "fullName",
        "email",
        "phone",
        "street",
        "city",
        "country",
        "location",
        "sex",
        "yob",
        "bloodId",
        "avatar",
        "isAvailable",
        "isVerified",
        "status",
        "profileLevel",
        "role",
        "idCard",
        "address",
        "phone",
      ],
      object: user,
    });

    return {
      ...userInfo,
      donationStats,
    };
  };

  // Lấy danh sách user
  getUsers = async ({ status, isAvailable, limit = 10, page = 1 }) => {
    const query = {};
    if (status) query.status = status;
    if (isAvailable) query.isAvailable = isAvailable;
    const result = await getPaginatedData({
      model: userModel,
      query,
      page,
      limit,
      select:
        "_id fullName email phone street city country sex yob bloodId avatar isAvailable isVerified status idCard",
      populate: [{ path: "bloodId", select: "name" }],
      sort: { createdAt: -1 },
    });
    return result;
  };

  // Xóa tài khoản
  deleteAccount = async (userId) => {
    const user = await userModel.findByIdAndUpdate(
      userId,
      { status: USER_STATUS.INACTIVE, isAvailable: false },
      { new: true }
    );
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return { message: "Account deactivated successfully" };
  };

  // Quên mật khẩu - Gửi email đặt lại
  forgotPassword = async (email) => {
    const user = await userModel.findOne({ email });
    if (!user) {
      throw new NotFoundError("Email not found");
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = Date.now() + 3600000; // Hết hạn sau 1 giờ

    await userModel.findByIdAndUpdate(user._id, {
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetExpires,
    });

    return mailService.sendResetPasswordEmail(user.email, resetToken);
  };

  // Đặt lại mật khẩu
  resetPassword = async ({ token, newPassword }) => {
    const user = await userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new BadRequestError("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await userModel.findByIdAndUpdate(user._id, {
      password: passwordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });

    return { message: "Password reset successfully" };
  };

  // Cập nhật expo push token
  updateExpoToken = async (userId, expoPushToken) => {
    const user = await userModel.findByIdAndUpdate(userId, {
      expoPushToken,
    });
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return { message: "Expo push token updated successfully" };
  };
}

module.exports = new UserService();
