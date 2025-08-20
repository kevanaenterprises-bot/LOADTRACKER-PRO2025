// Test data setup script to create sample loads for demonstrating automatic invoice generation
const testLoads = [
  {
    number109: "TEST001",
    pickupLocation: "Atlanta, GA",
    deliveryLocation: "Miami, FL", // This should match one of our rate locations
    driverName: "John Smith", // Our test driver
    lumperCharge: 150.00,
    extraStops: 2,
    status: "in_transit"
  },
  {
    number109: "TEST002", 
    pickupLocation: "Chicago, IL",
    deliveryLocation: "Houston, TX", // Another rate location
    driverName: "John Smith",
    lumperCharge: 0.00,
    extraStops: 1,
    status: "delivered"
  },
  {
    number109: "TEST003",
    pickupLocation: "Los Angeles, CA", 
    deliveryLocation: "Phoenix, AZ", // Another rate location
    driverName: "John Smith",
    lumperCharge: 75.00,
    extraStops: 0,
    status: "at_receiver"
  }
];

console.log("Test loads to create:", testLoads);