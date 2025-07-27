const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

// Load different API documents
const mainSwaggerDocument = YAML.load(
  path.join(__dirname, "../../docs/openapi.yaml")
);

const giftApiDocument = YAML.load(
  path.join(__dirname, "../../docs/gift-api.yaml")
);

const bloodDonationRegistrationApiDocument = YAML.load(
  path.join(__dirname, "../../docs/blood-donation-registration-api.yaml")
);

const bloodDonationApiDocument = YAML.load(
  path.join(__dirname, "../../docs/blood-donation-api.yaml")
);

const bloodRequestApiDocument = YAML.load(
  path.join(__dirname, "../../docs/blood-request-api.yaml")
);

const bloodInventoryApiDocument = YAML.load(
  path.join(__dirname, "../../docs/blood-inventory-api.yaml")
);

const facilityStaffApiDocument = YAML.load(
  path.join(__dirname, "../../docs/facility-staff-api.yaml")
);

const bloodUnitApiDocument = YAML.load(
  path.join(__dirname, "../../docs/blood-unit-api.yaml")
);

const bloodDeliveryApiDocument = YAML.load(
  path.join(__dirname, "../../docs/blood-delivery-api.yaml")
);

const contentApiDocument = YAML.load(
  path.join(__dirname, "../../docs/content-api.yaml")
);

const addServers = (req, doc) => {
  const modifiedDoc = { ...doc };
  let protocol = req.protocol;
  let host = req.get("host");

  // Force HTTPS và host cố định cho production
  if (process.env.NODE_ENV === "production") {
    protocol = "https";
    host = "api.hienmau.io.vn"; // Force sử dụng domain production
  }

  modifiedDoc.servers = [
    {
      url: `${protocol}://${host}/api/v1`,
      description:
        process.env.NODE_ENV === "production"
          ? "Production server"
          : "Development server",
    },
  ];

  return modifiedDoc;
};

// Main API documentation setup
const mainSwaggerSetup = (req, res) => {
  const doc = addServers(req, mainSwaggerDocument);
  return swaggerUi.generateHTML(doc);
};

// Gift API documentation setup
const giftSwaggerSetup = (req, res) => {
  const doc = addServers(req, giftApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Blood Donation Registration API documentation setup
const bloodDonationRegistrationSwaggerSetup = (req, res) => {
  const doc = addServers(req, bloodDonationRegistrationApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Blood Donation API documentation setup
const bloodDonationSwaggerSetup = (req, res) => {
  const doc = addServers(req, bloodDonationApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Blood Request API documentation setup
const bloodRequestSwaggerSetup = (req, res) => {
  const doc = addServers(req, bloodRequestApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Blood Inventory API documentation setup
const bloodInventorySwaggerSetup = (req, res) => {
  const doc = addServers(req, bloodInventoryApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Facility Staff API documentation setup
const facilityStaffSwaggerSetup = (req, res) => {
  const doc = addServers(req, facilityStaffApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Blood Unit API documentation setup
const bloodUnitSwaggerSetup = (req, res) => {
  const doc = addServers(req, bloodUnitApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Blood Delivery API documentation setup
const bloodDeliverySwaggerSetup = (req, res) => {
  const doc = addServers(req, bloodDeliveryApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Content API documentation setup
const contentSwaggerSetup = (req, res) => {
  const doc = addServers(req, contentApiDocument);
  return swaggerUi.generateHTML(doc);
};

// Generic function to get API document
const getApiDocument = (apiType = "main") => {
  switch (apiType) {
    case "gift":
      return giftApiDocument;
    case "blood-donation-registration":
      return bloodDonationRegistrationApiDocument;
    case "blood-donation":
      return bloodDonationApiDocument;
    case "blood-request":
      return bloodRequestApiDocument;
    case "blood-inventory":
      return bloodInventoryApiDocument;
    case "facility-staff":
      return facilityStaffApiDocument;
    case "blood-unit":
      return bloodUnitApiDocument;
    case "blood-delivery":
      return bloodDeliveryApiDocument;
    case "content":
      return contentApiDocument;
    case "main":
    default:
      return mainSwaggerDocument;
  }
};

// Generic setup function
const createSwaggerSetup = (apiType) => {
  return (req, res) => {
    const doc = addServers(req, getApiDocument(apiType));
    return swaggerUi.generateHTML(doc);
  };
};

// Swagger UI options
const swaggerUiOptions = {
  swaggerOptions: {
    requestInterceptor: (request) => {
      // Add CORS headers
      request.headers["Access-Control-Allow-Origin"] = "*";
      return request;
    },
    responseInterceptor: (response) => {
      // Handle CORS response
      return response;
    },
  },
};

// Setup all Swagger routes function
const setupSwaggerRoutes = (app) => {
  // Thêm middleware để force HTTPS trong production
  // app.use(["/api-docs", "/*/docs"], (req, res, next) => {
  //   if (process.env.NODE_ENV === "production") {
  //     if (req.headers["x-forwarded-proto"] !== "https") {
  //       // Redirect to HTTPS
  //       return res.redirect(`https://${req.headers.host}${req.url}`);
  //     }
  //   }
  //   next();
  // });

  // Main API documentation
  app.use("/api-docs", swaggerUi.serve);
  app.get("/api-docs", (req, res) => {
    const html = mainSwaggerSetup(req, res);
    res.send(html);
  });

  // Gift API documentation
  app.use("/gift-docs", swaggerUi.serve);
  app.get("/gift-docs", (req, res) => {
    res.send(giftSwaggerSetup(req, res));
  });

  // Blood Donation Registration API documentation
  app.use("/blood-donation-registration-docs", swaggerUi.serve);
  app.get("/blood-donation-registration-docs", (req, res) => {
    res.send(bloodDonationRegistrationSwaggerSetup(req, res));
  });

  // Blood Donation API documentation
  app.use("/blood-donation-docs", swaggerUi.serve);
  app.get("/blood-donation-docs", (req, res) => {
    res.send(bloodDonationSwaggerSetup(req, res));
  });

  // Blood Request API documentation
  app.use("/blood-request-docs", swaggerUi.serve);
  app.get("/blood-request-docs", (req, res) => {
    res.send(bloodRequestSwaggerSetup(req, res));
  });

  // Blood Inventory API documentation
  app.use("/blood-inventory-docs", swaggerUi.serve);
  app.get("/blood-inventory-docs", (req, res) => {
    res.send(bloodInventorySwaggerSetup(req, res));
  });

  // Facility Staff API documentation
  app.use("/facility-staff-docs", swaggerUi.serve);
  app.get("/facility-staff-docs", (req, res) => {
    res.send(facilityStaffSwaggerSetup(req, res));
  });

  // Blood Unit API documentation
  app.use("/blood-unit-docs", swaggerUi.serve);
  app.get("/blood-unit-docs", (req, res) => {
    res.send(bloodUnitSwaggerSetup(req, res));
  });

  // Blood Delivery API documentation
  app.use("/blood-delivery-docs", swaggerUi.serve);
  app.get("/blood-delivery-docs", (req, res) => {
    res.send(bloodDeliverySwaggerSetup(req, res));
  });

  // Content API documentation
  app.use("/content-docs", swaggerUi.serve);
  app.get("/content-docs", (req, res) => {
    res.send(contentSwaggerSetup(req, res));
  });

  // Log all documentation routes
};

module.exports = {
  swaggerUi,
  // Legacy support - main API
  swaggerSetup: mainSwaggerSetup,

  // Individual setups
  mainSwaggerSetup,
  giftSwaggerSetup,
  bloodDonationRegistrationSwaggerSetup,
  bloodDonationSwaggerSetup,
  bloodRequestSwaggerSetup,
  bloodInventorySwaggerSetup,
  facilityStaffSwaggerSetup,
  bloodUnitSwaggerSetup,
  bloodDeliverySwaggerSetup,
  contentSwaggerSetup,

  // Generic functions
  createSwaggerSetup,
  getApiDocument,

  // New: Setup all routes function
  setupSwaggerRoutes,
};
