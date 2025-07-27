const express = require("express");
const router = express.Router();
const userController = require("../../controllers/user.controller");
const { checkAuth, checkRole } = require("../../auth/checkAuth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { USER_ROLE } = require("../../constants/enum");

router.get("/nearby", userController.findNearbyUsers); // Không cần auth
router.post("/forgot-password", userController.forgotPassword); // Không cần auth
router.post("/reset-password", userController.resetPassword); // Không cần auth

router.use(checkAuth);

// Admin routes
router.post("/admin/create", checkRole(USER_ROLE.ADMIN), userController.createUser);
router.patch("/admin/update/:id", checkRole(USER_ROLE.ADMIN), userController.adminUpdateUser);

router.get("/", userController.getUsers);
router.get("/me", userController.getUserInfo);
router.patch("/blood-group", userController.updateBloodGroup);
router.patch("/profile", userController.updateProfile);
router.post("/verify-email", userController.sendVerificationEmail);
router.post("/verify", userController.verifyAccount);
router.post("/kyc/upload-cccd", upload.single("cccd"), userController.uploadCCCD);
router.post("/verify-level2", userController.verifyLevel2);
router.patch("/password", userController.changePassword);
router.patch("/avatar", userController.updateAvatar);
router.delete("/", userController.deleteAccount);
router.patch("/update-expo-token", userController.updateExpoToken);

module.exports = router;
