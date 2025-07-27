"use strict";

const { OK, CREATED } = require("../configs/success.response");
const { FACILITY_MESSAGE } = require("../constants/message");
const asyncHandler = require("../helpers/asyncHandler");
const facilityService = require("../services/facility.service");

class FacilityController {
  getAllFacilities = asyncHandler(async (req, res, next) => {
    const result = await facilityService.getAllFacilities(req.query);
    new OK({
      message: FACILITY_MESSAGE.GET_ALL_FACILITIES_SUCCESS,
      data: result,
    }).send(res);
  });

  getFacilityById = asyncHandler(async (req, res, next) => {
    const result = await facilityService.getFacilityById(req.params.id);
    new OK({
      message: FACILITY_MESSAGE.GET_FACILITY_BY_ID_SUCCESS,
      data: result,
    }).send(res);
  });

  getFacilityStats = asyncHandler(async (req, res, next) => {
    const result = await facilityService.getFacilityStats(req.params.id);
    new OK({
      message: FACILITY_MESSAGE.GET_FACILITY_STATS_SUCCESS,
      data: result,
    }).send(res);
  });

  createFacility = asyncHandler(async (req, res, next) => {
    const result = await facilityService.createFacility(req.body, req.file);
    new CREATED({
      message: FACILITY_MESSAGE.CREATE_FACILITY_SUCCESS,
      data: result,
    }).send(res);
  });

  updateFacility = asyncHandler(async (req, res, next) => {
    const result = await facilityService.updateFacility(
      req.params.id,
      req.body,
      req.file
    );
    new OK({
      message: FACILITY_MESSAGE.UPDATE_FACILITY_SUCCESS,
      data: result,
    }).send(res);
  });

  deleteFacility = asyncHandler(async (req, res, next) => {
    const result = await facilityService.deleteFacility(req.params.id);
    new OK({
      message: ACCESS_MESSAGE.DELETE_FACILITY_SUCCESS,
      data: result,
    }).send(res);
  });
}

module.exports = new FacilityController();
