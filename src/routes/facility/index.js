const express = require("express");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const facilityController = require("../../controllers/facility.controller");
const { checkRole, checkAuth } = require("../../auth/checkAuth");
const { USER_ROLE } = require("../../constants/enum");

const router = express.Router();

router.get("/", facilityController.getAllFacilities);
router.get("/:id", facilityController.getFacilityById);

router.use(checkAuth);
router.use(checkRole([USER_ROLE.MANAGER, USER_ROLE.ADMIN]));
router.get("/:id/stats", facilityController.getFacilityStats);

router.use(checkRole([USER_ROLE.ADMIN]));
router.post("/", upload.single("image"), facilityController.createFacility);

router.put("/:id", upload.single("image"), facilityController.updateFacility);
router.put("/delete/:id", facilityController.deleteFacility);

module.exports = router;
