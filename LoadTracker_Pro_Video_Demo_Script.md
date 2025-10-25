# LoadTracker Pro - Video Demo Script
## Complete Product Walkthrough with Narration

**Instructions:** Navigate to each section on your Railway deployment while reading the narration. Record your screen as you go through each feature.

---

## SCENE 1: Login Screen (Homepage)
**What to show:** Navigate to your Railway URL homepage

**NARRATION:**
"Welcome to LoadTracker Pro - professional transportation management built by truckers, for truckers.

Right away, you'll notice how clean and simple this is. No cluttered dashboard overwhelming you with information you don't need.

You've got two options here: Admin Login for your office staff and dispatchers, and Driver Login - a mobile-optimized portal for your drivers on the road.

Notice the branding at the top - Turtle Logistics. This is YOUR company. The system uses your company name and logo throughout.

Let's click Admin Login and see what your dispatch office sees every day."

**ACTION:** Click "Admin Login"

---

## SCENE 2: Main Dashboard
**What to show:** After logging in, show the main dashboard with the Real-Time Fleet Map

**NARRATION:**
"This is your command center. The Real-Time Fleet Tracking map.

See those truck markers? Those are your trucks right now, in real-time. Not 'last known location from 3 hours ago' - this is live tracking updated every 30 seconds.

Notice each truck has the driver's name right below it - KEVIN OWEN, TORRIS OWEN - so you can instantly tell which truck is which. Color-coded by status: blue for en route, purple for in transit, green for at receiver.

On the right, you see your Active Loads list - two loads currently in transit. Load 6022412 heading to Lancaster, Texas with Kevin. Load 109-40178 going to Oklahoma City with Torris.

See those buttons at the top? Weather shows real-time weather conditions at each truck location. Fuel finds nearby diesel stations. And that Auto Refresh toggle? The map updates automatically every 30 seconds so you always see current positions.

This is what GPS tracking should be. No expensive hardware. Just your driver's phone and this system."

**ACTION:** Click the "Weather" button to show the weather overlay

---

## SCENE 3: Weather and Fuel Features
**What to show:** With weather toggled on, show weather data appearing on the map

**NARRATION:**
"With one click, you can see the weather conditions at each truck's location. Temperature, conditions - real-time data from HERE Weather API.

Your driver's in a snowstorm? You'll know before they call you.

Click Fuel, and the system finds the nearest diesel stations along their routes. Helps drivers plan fuel stops, helps you track fuel costs.

All integrated right into the tracking map. No jumping between different programs."

**ACTION:** Click on a truck marker to show the info popup

---

## SCENE 4: Truck Marker Popup
**What to show:** The popup showing load details when clicking a truck marker

**NARRATION:**
"Click any truck marker and you get the full picture: driver name, phone number, current status, destination, even the current weather where they are.

Everything you need to know in one glance.

Let's look at the loads page and see how you manage freight from start to finish."

**ACTION:** Navigate to the Loads page in the sidebar

---

## SCENE 5: Loads Management Page
**What to show:** The loads list/table showing multiple loads

**NARRATION:**
"This is your loads board - every load in the system.

You can see load numbers, customers, drivers assigned, pickup and delivery locations, status, and those purple badges showing 'In Transit' or 'Delivered.'

Creating a new load is simple. Click Create Load, fill in the details, assign a driver, and you're done.

But here's where it gets smart - see that 'Enable GPS Tracking' checkbox when creating a load? Check that box, and as soon as the driver accepts the load, GPS tracking starts automatically.

The system uses geofencing to detect when they arrive at the shipper. Gets within 100 meters? Automatic timestamp. When they leave? Another timestamp.

Why does this matter? Detention billing disputes. Customer says your driver showed up late? You've got GPS-verified timestamps accurate to 3 meters. Legally defensible proof."

**ACTION:** Click "Create Load" to show the form

---

## SCENE 6: Create Load Form
**What to show:** The load creation form with all fields visible

**NARRATION:**
"Look how clean this is. Load number - use whatever system you want: 109 numbers, trip numbers, BOL numbers, whatever works for you.

Select your customer, shipper, and receiver from dropdowns - all pre-configured with addresses and GPS coordinates.

Pickup and delivery dates, estimated miles, rate - all the standard stuff.

But here's something the expensive systems charge extra for: multiple stops. You can add as many stops as you need. No additional fees.

Lumper charges, fuel surcharges, special instructions - it's all here.

And see that 'Enable GPS Tracking' checkbox? One click, and this load gets real-time tracking from pickup to delivery.

Let's save this and move on to something really cool - document management."

**ACTION:** Navigate to the Documents or a specific load details page

---

## SCENE 7: Document Management & OCR
**What to show:** Upload a rate confirmation or show the document upload interface

**NARRATION:**
"Every trucking company drowns in paperwork. Rate confirmations, BOLs, PODs, fuel receipts.

LoadTracker Pro handles it all with Google Cloud Storage - secure, backed up, accessible from anywhere.

But here's the game-changer: OCR - Optical Character Recognition.

Watch what happens when you upload a rate confirmation PDF..."

**ACTION:** (If possible, upload a sample rate con) or explain: "The system automatically reads the document"

**NARRATION:**
"The system reads it. Automatically. It pulls out the load number, pickup location, delivery location, rate - all the details extracted without typing a single character.

That's Google's Document AI technology doing the work for you.

Same with BOL numbers. Driver takes a photo of the BOL, uploads it, system validates it.

Hours of data entry eliminated."

**ACTION:** Navigate to Driver page or show driver records

---

## SCENE 8: Driver Management
**What to show:** The driver records list

**NARRATION:**
"Managing your driver records is just as streamlined.

Complete driver profiles: name, phone number, email, license number, CDL expiration, medical card expiration, hire date.

Pay structure - whether they get percentage-based pay or per-mile rates, it's all tracked here.

Direct deposit information for quick payroll.

And here's a nice touch - the system can alert you when a medical card is about to expire. No more Post-It notes on the wall trying to remember whose medical is coming due.

Your drivers need license expiration tracking? Equipment assignments? It's all here."

**ACTION:** Navigate to Trucks/Fleet management

---

## SCENE 9: Fleet/Truck Management  
**What to show:** Truck records with service history

**NARRATION:**
"Your trucks are expensive assets. LoadTracker Pro helps you protect them.

VIN number, year, make, model, license plate - all the basics.

But more importantly: odometer readings, service history, maintenance schedules.

The system can alert you when a truck is due for service based on mileage. Preventive maintenance before something breaks down on I-40 in the middle of nowhere.

Service records are logged with dates, costs, service provider - full history for each truck.

Resale value goes up when you can show complete maintenance records."

**ACTION:** Navigate to IFTA reporting or Invoicing

---

## SCENE 10: IFTA Reporting
**What to show:** The IFTA dashboard with state mileage breakdown

**NARRATION:**
"Every quarter, you need IFTA reports. Every quarter, it's usually a headache.

Not with LoadTracker Pro.

As your trucks move, the GPS system tracks which states they're traveling through. Logs the mileage in each state automatically.

At quarter-end, you get this: a ready-to-file report with complete state-by-state mileage breakdown.

See that? Miles in Iowa, Kansas, Texas, every state broken down by jurisdiction. Odometer readings verified by GPS coordinates.

Even when a driver is deadheading back to your terminal, they can track IFTA miles. The system calculates the route and logs the state mileage.

No more spreadsheets, no more guessing. Just accurate IFTA reporting ready to file."

**ACTION:** Navigate to Invoicing or show an invoice

---

## SCENE 11: Automated Invoicing
**What to show:** An invoice generated from a completed load

**NARRATION:**
"Now let's talk about getting paid - automated invoicing.

When a load is marked delivered, LoadTracker Pro can generate an invoice automatically.

Look at this: load details, base rate, mileage, all the standard billing information.

But here's where the GPS tracking pays off - detention time.

Customer made your driver wait 4 hours at the dock? The GPS system has timestamps proving when your driver arrived and when they actually got loaded.

That detention charge goes right on the invoice with GPS-verified proof. No disputes, no arguments. Third-party coordinates that hold up in court if needed.

Lumper fees, fuel surcharges, accessorial charges - everything itemized clearly.

Track payment status too. See which invoices are paid, pending, or overdue."

**ACTION:** Navigate to Accounts Receivable or Aging Report

---

## SCENE 12: Accounts Receivable Aging
**What to show:** The aging report with color-coded categories

**NARRATION:**
"Speaking of getting paid - who owes you money right now?

The Accounts Receivable Aging Report shows you at a glance.

Invoices are categorized: 0 to 30 days, 31 to 60, 61 to 90, over 90 days.

Color-coded so problems jump out. Red means someone's way overdue and you need to make a call.

Customer-level breakdown shows you which customers pay on time and which ones you need to stay on top of.

Cash flow is the lifeblood of any trucking company. This report helps you protect it."

**ACTION:** Navigate back to dashboard or switch to driver view

---

## SCENE 13: Driver Mobile Portal (if possible, show on phone)
**What to show:** The driver portal on a mobile device or browser mobile view

**NARRATION:**
"Now let's look at what your drivers see - the mobile portal.

Your drivers aren't sitting at desks. They're on the road. So we built this interface specifically for phones.

Big buttons. Simple screens. Everything they need, nothing they don't.

See their assigned loads right here. Current status. Destination information.

When they're ready to start a load, one tap on 'Accept Load & Start Tracking' and GPS tracking begins automatically.

They can see their current route on a map. Upload proof-of-delivery photos straight from their phone camera. Sign documents digitally with their finger.

No more 'I'll get you that paperwork when I'm back next week.' POD uploaded before they leave the customer's lot.

And look - GPS Active showing their current coordinates with accuracy down to 3 meters. Updates every 30 seconds.

All of this works on any smartphone. iPhone, Android, doesn't matter."

**ACTION:** Show the GPS tracking card on driver portal

---

## SCENE 14: GPS Tracking (Driver View)
**What to show:** The GPS active indicator with coordinates

**NARRATION:**
"This is the GPS tracking from the driver's perspective.

'GPS Active' - tracking is running. Last updated timestamp shows it's live.

Accuracy ±3 meters - that's GPS-grade positioning.

The driver doesn't have to do anything. Just accepts the load, grants location permission once, and the system handles the rest.

As they drive toward the shipper, the system monitors their position. Gets within 100 meters of the shipper's location? Status automatically updates to 'At Shipper' with a timestamp.

When they leave? Another automatic update with timestamp.

Same thing at the receiver.

Automatic status progression based on GPS position. No driver forgetting to update. No dispatcher calling to ask 'where are you?'

Just real tracking working the way it should."

**ACTION:** Go back to admin view and show the Road Tour feature if available

---

## SCENE 15: Historical Marker Road Tour (Bonus Feature)
**What to show:** The road tour settings or historical marker feature

**NARRATION:**
"Here's a fun bonus feature that your drivers will love - Historical Marker Road Tours.

We integrated a database of over 222,000 historical markers across the United States.

As your driver passes near one, the system automatically triggers an audio narration about that piece of history.

Keeps drivers engaged on long hauls. Educational. Interesting.

They can choose a male or female AI voice - professional narration automatically generated.

It's not essential to running your business, but it's the kind of touch that shows we actually think about what it's like to drive 500 miles in a day.

Your drivers will appreciate it."

---

## SCENE 16: Closing - Pricing & Value Proposition
**What to show:** Return to dashboard or a summary view

**NARRATION:**
"So let's recap what you get with LoadTracker Pro:

Real-time GPS fleet tracking with automatic arrival and departure detection.

Complete load management from creation to delivery.

Mobile driver portal that actually works on phones.

Automated invoicing with GPS-verified detention time.

Smart document management with OCR that reads your paperwork automatically.

IFTA reporting with automatic state mileage tracking.

Driver pay management with flexible pay structures.

Fleet and truck service tracking.

Accounts receivable aging reports.

And yes, even those historical marker road tours.

All of this for $249 per month.

Not per user. Not per truck. Not per load.

$249 flat rate with unlimited users.

Your entire office can work simultaneously. Three dispatchers? Ten? Doesn't matter. One price.

We give you a generous free tier for loads and GPS usage. If you go over, there are usage charges, but you'll always know exactly where you stand because the usage dashboard shows you real-time consumption.

No surprise bills. No forced feature bundles. No paying extra for your own employees to do their jobs.

Compare that to $700 a month systems that charge per seat, per feature package, per load.

LoadTracker Pro wasn't built by a software company trying to maximize profit.

It was built by a trucking company owner who got tired of getting ripped off.

This is TMS software that's actually on your side.

Try our instant demo at LoadTrackerPro.com.

$249 per month. Unlimited users. Everything you need.

Welcome to transportation management that makes sense."

---

## END OF DEMO

**Total Runtime:** Approximately 10-12 minutes depending on pace
**Screen Recording Tips:**
- Slow down when showing key features
- Let complex screens sit for 2-3 seconds so viewers can read
- Click through menus slowly so people can follow along
- Pause on the truck map to let viewers see the real-time markers
- Show the driver mobile view if possible for maximum impact
