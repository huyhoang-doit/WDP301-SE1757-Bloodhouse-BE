"use strict";

const mongoose = require("mongoose");
const BloodDonationRegistration = require("../models/bloodDonationRegistration.model");
const User = require("../models/user.model");
const FacilityStaff = require("../models/facilityStaff.model");
const { getInfoData } = require("../utils");
const { BadRequestError } = require("../configs/error.response");
const { STAFF_POSITION, USER_ROLE, BLOOD_DONATION_REGISTRATION_STATUS } = require("../constants/enum");
const healthCheckModel = require("../models/healthCheck.model");
const { getPaginatedData } = require("../helpers/mongooseHelper");
const processDonationLogService = require("./processDonationLog.service");
const notificationService = require("./notification.service");

class HealthCheckService {
  // Nhân viên tạo đơn kiểm tra sức khỏe
  createHealthCheck = async (
    { userId, doctorId, registrationId },
    staffId
  ) => {
    // Step 1: Validate staff
    const staff = await FacilityStaff.findOne({
      _id: staffId,
      position: STAFF_POSITION.NURSE,
      isDeleted: false
    });
    if (!staff) {
      throw new BadRequestError("Nhân viên không tồn tại hoặc không có quyền");
    }

    // Step 2: Validate required fields
    if (!registrationId || !userId || !doctorId) {
      throw new BadRequestError(
        "Thiếu registrationId, userId hoặc doctorId"
      );
    }

    // Step 3: Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(registrationId)) {
      throw new BadRequestError("registrationId không hợp lệ");
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new BadRequestError("userId không hợp lệ");
    }
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      throw new BadRequestError("doctorId không hợp lệ");
    }

    // Step 4: Check if registration, user, and doctor exist
    const registration = await BloodDonationRegistration.findById(registrationId);
    if (!registration) {
      throw new BadRequestError("Đăng ký hiến máu không tồn tại");
    }
    const user = await User.findById(userId);
    if (!user) {
      throw new BadRequestError("Người dùng không tồn tại");
    }
    const doctor = await FacilityStaff.findOne({
      _id: doctorId,
      position: STAFF_POSITION.DOCTOR,
      facilityId: staff.facilityId,
      isDeleted: false
    });
    if (!doctor) {
      throw new BadRequestError("Bác sĩ không tồn tại hoặc không thuộc cơ sở này");
    }
    
    // check if registration is in CHECKED_IN status
    if (registration.status !== BLOOD_DONATION_REGISTRATION_STATUS.CHECKED_IN) {
      throw new BadRequestError("Đăng ký hiến máu không ở trạng thái đã check-in");
    }

    // update registration status to IN_CONSULT
    registration.status = BLOOD_DONATION_REGISTRATION_STATUS.IN_CONSULT;
    registration.checkInAt = new Date();
    await registration.save();

    // Step 5: Create health check
    const healthCheck = await healthCheckModel.create({
      registrationId,
      userId,
      staffId,
      doctorId,
      facilityId: staff.facilityId,
      checkDate: registration.checkInAt,
    });

    // Step 6: Create process health check log
    await processDonationLogService.createProcessDonationLog({
      registrationId,
      userId,
      changedBy: staffId,
      status: BLOOD_DONATION_REGISTRATION_STATUS.IN_CONSULT,
      notes: "Kiểm tra sức khỏe",
    });

    // Step 7: Send notification to user
    await notificationService.sendBloodDonationRegistrationStatusNotification(
      userId,
      BLOOD_DONATION_REGISTRATION_STATUS.IN_CONSULT,
      registration.facilityId.name,
      registration._id
    );

    // Step 7: Populate and return
    const result = await healthCheck.populate([
      { path: "userId", select: "fullName email" },
      { path: "staffId", select: "position" },
      { path: "doctorId", select: "position" },
    ]);
    return {
      data: getInfoData({
        fields: [
          "_id",
          "registrationId",
          "userId",
          "doctorId",
          "staffId",
          "facilityId",
          "checkDate",
          "isEligible",
          "bloodPressure",
          "hemoglobin",
          "weight",
          "pulse",
          "temperature",
          "generalCondition",
          "deferralReason",
          "notes",
          "createdAt",
          "updatedAt",
        ],
        object: result,
      }),
    };
  };

  // Bác sĩ cập nhật thông tin kiểm tra sức khỏe
  updateHealthCheck = async (id, reqBody, staffId) => {
    // Step 1: Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError("ID kiểm tra sức khỏe không hợp lệ");
    }

    // Step 2: Find health check
    const healthCheck = await healthCheckModel.findById(id);
    if (!healthCheck) {
      throw new BadRequestError("Kiểm tra sức khỏe không tồn tại");
    }

    // Step 3: Verify doctor is assigned to this health check
    if (healthCheck.doctorId.toString() !== staffId) {
      throw new BadRequestError("Bạn không được phân công cho kiểm tra sức khỏe này");
    }

    // Step 4: Update allowed fields
    const updateData = {
      isEligible:
        reqBody.isEligible !== undefined
          ? reqBody.isEligible
          : healthCheck.isEligible,
      bloodPressure: reqBody.bloodPressure || healthCheck.bloodPressure,
      hemoglobin: reqBody.hemoglobin || healthCheck.hemoglobin,
      weight: reqBody.weight || healthCheck.weight,
      pulse: reqBody.pulse || healthCheck.pulse,
      temperature: reqBody.temperature || healthCheck.temperature,
      generalCondition:
        reqBody.generalCondition || healthCheck.generalCondition,
      deferralReason: reqBody.deferralReason || healthCheck.deferralReason,
      notes: reqBody.notes || healthCheck.notes,
    };

    // Step 5: Validate isEligible and deferralReason
    if (updateData.isEligible === false && !updateData.deferralReason) {
      throw new BadRequestError(
        "Cần cung cấp lý do không đủ điều kiện (deferralReason)"
      );
    }
    const registration = await BloodDonationRegistration.findById(healthCheck.registrationId);
    // Update registration status if eligible
    if (updateData.isEligible === true ) {
      // Send notification to user
      updateData.deferralReason = null;
      await notificationService.sendBloodDonationRegistrationStatusNotification(
        registration.userId,
        BLOOD_DONATION_REGISTRATION_STATUS.WAITING_DONATION,
        registration.facilityId.name,
        registration._id
      );
      // Update registration status
      registration.status = BLOOD_DONATION_REGISTRATION_STATUS.WAITING_DONATION;
      await registration.save();
    } else {
      // Send notification to user
      await notificationService.sendBloodDonationRegistrationStatusNotification(
        registration.userId,
        BLOOD_DONATION_REGISTRATION_STATUS.REGISTERED,
        registration.facilityId.name,
        registration._id
      );  
      // Update registration status
      registration.status = BLOOD_DONATION_REGISTRATION_STATUS.REGISTERED;
      await registration.save();
    }
    

    // Step 6: Update health check
    const updatedHealthCheck = await healthCheckModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    

    if (!updatedHealthCheck) {
      throw new BadRequestError("Cập nhật kiểm tra sức khỏe không thành công");
    }

    // Step 7: Create process donation  log
    if(updateData.isEligible === true) {
      await processDonationLogService.createProcessDonationLog({
        registrationId: updatedHealthCheck.registrationId,
        userId: updatedHealthCheck.userId,
        changedBy: staffId,
        status: BLOOD_DONATION_REGISTRATION_STATUS.WAITING_DONATION,
        notes: "Đã đủ điều kiện hiến máu",
      });
    } else {
      await processDonationLogService.createProcessDonationLog({
        registrationId: updatedHealthCheck.registrationId,
        userId: updatedHealthCheck.userId,
        changedBy: staffId,
        status: BLOOD_DONATION_REGISTRATION_STATUS.REGISTERED,
        notes: "Không đủ điều kiện hiến máu",
      });
    }

    // Step 7: Populate and return
    const result = await updatedHealthCheck.populate([
      { path: "userId", select: "fullName email" },
      { path: "staffId", select: "position" },
      { path: "doctorId", select: "position" },
    ]);
    return {
      data: getInfoData({
        fields: [
          "_id",
          "registrationId",
          "userId",
          "doctorId",
          "staffId",
          "checkDate",
          "isEligible",
          "bloodPressure",
          "hemoglobin",
          "weight",
          "pulse",
          "temperature",
          "generalCondition",
          "deferralReason",
          "notes",
          "createdAt",
          "updatedAt",
        ],
        object: result,
      }),
    };
  };

  // Lấy danh sách kiểm tra sức khỏe của cơ sở
  getFacilityHealthChecks = async (
    facilityId,
    {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = -1,
    }
  ) => {
    const query = { facilityId };
    if (status) {
      query.isEligible = status === "eligible";
    }

    // Validate sortBy
    const validSortFields = ["createdAt", "updatedAt", "checkDate"];
    if (!validSortFields.includes(sortBy)) {
      throw new BadRequestError(
        `Trường sắp xếp không hợp lệ. Các trường hợp lệ: ${validSortFields.join(
          ", "
        )}`
      );
    }

    // Xây dựng object sort
    const sort = { [sortBy]: parseInt(sortOrder) };

    return await getPaginatedData({
      model: healthCheckModel,
      query,
      page,
      limit,
      select: "_id registrationId userId doctorId staffId facilityId checkDate isEligible bloodPressure hemoglobin weight pulse temperature generalCondition deferralReason notes createdAt updatedAt",
      populate: [
        { path: "userId", select: "fullName email" },
        { path: "staffId", select: "position" },
        { path: "doctorId", select: "position" },
        { 
          path: "registrationId", 
          select: "facilityId",
          populate: { path: "facilityId", select: "name address" }
        }
      ],
      search,
      searchFields: ["generalCondition", "notes", "deferralReason"],
      sort,
    });
  };

  // Lấy danh sách kiểm tra sức khỏe của bác sĩ
  getDoctorHealthChecks = async (
    staffId,
    {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = -1,
    }
  ) => {
    // Get staff info to get facilityId
    const staff = await FacilityStaff.findById(staffId);
    if (!staff) {
      throw new BadRequestError("Không tìm thấy thông tin nhân viên");
    }

    const query = { 
      doctorId: staffId,
      facilityId: staff.facilityId
    };
    if (status) {
      query.isEligible = status === "eligible";
    }

    // Validate sortBy
    const validSortFields = ["createdAt", "updatedAt", "checkDate"];
    if (!validSortFields.includes(sortBy)) {
      throw new BadRequestError(
        `Trường sắp xếp không hợp lệ. Các trường hợp lệ: ${validSortFields.join(
          ", "
        )}`
      );
    }

    // Xây dựng object sort
    const sort = { [sortBy]: parseInt(sortOrder) };

    return await getPaginatedData({
      model: healthCheckModel,
      query,
      page,
      limit,
      select: "_id registrationId userId doctorId staffId facilityId checkDate isEligible bloodPressure hemoglobin weight pulse temperature generalCondition deferralReason notes createdAt updatedAt",
      populate: [
        { path: "userId", select: "fullName email" },
        { path: "staffId", select: "position" },
        { path: "doctorId", select: "position" },
        { 
          path: "registrationId", 
          select: "facilityId",
          populate: { path: "facilityId", select: "name" }
        }
      ],
      search,
      searchFields: ["generalCondition", "notes", "deferralReason"],
      sort,
    });
  };

  // Lấy danh sách kiểm tra sức khỏe của người dùng
  getUserHealthChecks = async (
    userId,
    {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = -1,
    }
  ) => {
    const query = { userId };
    if (status) {
      query.isEligible = status === "eligible";
    }

    // Validate sortBy
    const validSortFields = ["createdAt", "updatedAt", "checkDate"];
    if (!validSortFields.includes(sortBy)) {
      throw new BadRequestError(
        `Trường sắp xếp không hợp lệ. Các trường hợp lệ: ${validSortFields.join(
          ", "
        )}`
      );
    }

    // Xây dựng object sort
    const sort = { [sortBy]: parseInt(sortOrder) };

    return await getPaginatedData({
      model: healthCheckModel,
      query,
      page,
      limit,
      select: "_id registrationId userId doctorId staffId facilityId checkDate isEligible bloodPressure hemoglobin weight pulse temperature generalCondition deferralReason notes createdAt updatedAt",
      populate: [
        { path: "userId", select: "fullName email" },
        { path: "staffId", select: "position" },
        { path: "doctorId", select: "position" },
        { 
          path: "registrationId", 
          select: "facilityId",
          populate: { path: "facilityId", select: "name" }
        }
      ],
      search,
      searchFields: ["generalCondition", "notes", "deferralReason"],
      sort,
    });
  };

  // Lấy danh sách kiểm tra sức khỏe của nurse
  getNurseHealthChecks = async (
    staffId,
    {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = -1,
    }
  ) => {
    // Get staff info to get facilityId
    const staff = await FacilityStaff.findById(staffId);
    if (!staff) {
      throw new BadRequestError("Không tìm thấy thông tin nhân viên");
    }

    const query = { 
      staffId,
      facilityId: staff.facilityId
    };
    if (status) {
      query.isEligible = status === "eligible";
    }

    // Validate sortBy
    const validSortFields = ["createdAt", "updatedAt", "checkDate"];
    if (!validSortFields.includes(sortBy)) {
      throw new BadRequestError(
        `Trường sắp xếp không hợp lệ. Các trường hợp lệ: ${validSortFields.join(
          ", "
        )}`
      );
    }

    // Xây dựng object sort
    const sort = { [sortBy]: parseInt(sortOrder) };

    return await getPaginatedData({
      model: healthCheckModel,
      query,
      page,
      limit,
      select: "_id registrationId userId doctorId staffId facilityId checkDate isEligible bloodPressure hemoglobin weight pulse temperature generalCondition deferralReason notes createdAt updatedAt",
      populate: [
        { path: "userId", select: "fullName email" },
        { path: "staffId", select: "position" },
        { path: "doctorId", select: "position" },
        { 
          path: "registrationId", 
          select: "facilityId",
          populate: { path: "facilityId", select: "name" }
        }
      ],
      search,
      searchFields: ["generalCondition", "notes", "deferralReason"],
      sort,
    });
  };

  // Lấy chi tiết kiểm tra sức khỏe
  getHealthCheckDetail = async (id, userId, role, staffId) => {
    const query = { _id: id };
    
    // Nếu là user thông thường, chỉ được xem health check của mình
    if (role === USER_ROLE.USER) {
      query.userId = userId;
    }
    // Nếu là doctor, chỉ được xem health check được phân công và thuộc cơ sở của doctor
    else if (role === USER_ROLE.DOCTOR) {
      const staff = await FacilityStaff.findById(staffId);
      if (!staff) {
        throw new BadRequestError("Không tìm thấy thông tin nhân viên");
      }
      query.doctorId = staffId;
      query.facilityId = staff.facilityId;
    }

    const healthCheck = await healthCheckModel.findOne(query)
      .populate("userId", "fullName email")
      .populate("staffId", "position")
      .populate("doctorId", "position")
      .populate({
        path: "registrationId",
        select: "facilityId",
        populate: { path: "facilityId", select: "name" }
      })
      .lean();

    if (!healthCheck) {
      throw new BadRequestError(
        "Không tìm thấy kiểm tra sức khỏe hoặc bạn không có quyền truy cập"
      );
    }

    return {
      data: getInfoData({
        fields: [
          "_id",
          "registrationId",
          "userId",
          "doctorId",
          "staffId",
          "facilityId",
          "checkDate",
          "isEligible",
          "bloodPressure",
          "hemoglobin",
          "weight",
          "pulse",
          "temperature",
          "generalCondition",
          "deferralReason",
          "notes",
          "createdAt",
          "updatedAt",
        ],
        object: healthCheck,
      }),
    };
  };
}

module.exports = new HealthCheckService();
