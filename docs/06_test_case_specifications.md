# Test Case Specifications

This subchapter contains 5 formal test case specifications for the Paw Print Profile application. Each test case describes the expected behavior of the system from a user perspective and can be executed manually against the running application.

**Recommended execution order:**
1. TC_SIGNUP_001 – New pet owner sign-up
2. TC_VET_002 – Veterinarian creates pet profile (login as vet, not claiming code)
3. TC_CLAIM_003 – Owner claims profile (starts as vet, switches to owner)
4. TC_MISSING_004 – Owner reports missing pet (login as owner)
5. TC_SEARCH_005 – Public search (no login needed, run last to verify missing pet appears)

---

## TEST CASE SPECIFICATION 1

**Test Case ID:** TC_SIGNUP_001

**Test Case Title:** Verify Pet Owner Sign-Up and Account Settings

**Test Case Description:** This test case verifies that a new pet owner can successfully create an account, log in, navigate to the Account Settings page, fill in their contact details and address, and have those details persist across page reloads.

**Preconditions:**
- The application is running locally (`docker compose up`)
- No account exists for the test email address
- The browser has no stored session data (clear cookies/localStorage)

**Test Steps:**
1. Navigate to http://localhost:8080/signup.
2. Select "Pet Owner" as the role.
3. Enter "max.mustermann@test.de" in the Email field.
4. Enter "Test1234!" in the Password field, and in the Confirm Password field.
5. Click the "Create Account" button.
6. Verify the automatic redirect to the Sign in page.
7. Enter "max.mustermann@test.de" in the Email field.
8. Enter "Test1234!" in the Password field.
9. Click the "Sign in" button.
10. Verify the navigation shows "Search Lost Pets", "Care Snapshot", "My Pets", "Claim Profile", and "Account Settings" (in this order)
11. Click "Account Settings" in the navigation bar.
12. Enter "Max Mustermann" in the Full Name field.
13. Enter "+49-171-9876543" in the Phone Number field.
14. Enter "Berliner Straße" in the Street field.
15. Enter "15" in the Nr. field.
16. Enter "10115" in the PLZ field.
17. Enter "Berlin" in the City field.
18. Click the "Save & Update All Profiles" button.
19. Wait for the success message (displayed above form, underneath Contact Details header).
20. Navigate to "Claim Profile" and verify the phone number and full name have been populated.
21. Navigate back to "Account Settings" and verify that the contact details (full name, address) have been populated.

**Expected Results:**
- After sign-up, a success message is displayed, and the user is redirected to the Sign In page.
- After sign-in, the user is redirected to the owner dashboard.
- The navigation bar shows: "Search Lost Pets", "Care Snapshot", "My Pets", "Claim Profile", and "Account Settings".
- The email field on Account Settings is read-only and shows "max.mustermann@test.de".
- After saving, the message "Contact details saved." is displayed above the form (0 pets, so no propagation).
- After page navigation, all fields retain their values (Full Name, Phone, Street, Nr., PLZ, City).
- The Account Overview shows "0" under "My Pets".

**Postconditions:** The pet owner account exists with saved contact details. The user can now claim pet profiles.

**Test Data:**
- Email: max.mustermann@test.de
- Password: Test1234!
- Full Name: Max Mustermann
- Phone: +49-171-9876543
- Street: Berliner Straße
- Nr.: 15
- PLZ: 10115
- City: Berlin

**Test Environment:**
- Browser: Google Chrome, latest version
- Application: Paw Print Profile v1.0.0 (local Docker environment)
- URL: http://localhost:8080

**Test Case Status:** Pass

**Test Case Notes:** The email field is intentionally read-only because it is the login credential. Changing the email requires a verification flow (deferred to post-submission). The "Contact details saved." message (without pet count) confirms that the user profile is stored independently of pet records.

---

## TEST CASE SPECIFICATION 2

**Test Case ID:** TC_VET_002

**Test Case Title:** Verify Veterinarian Creates Medical Pet Profile with Claiming Code

**Test Case Description:** This test case verifies that a veterinarian can create a new medically verified pet profile from the clinic dashboard. Upon creation, the system generates a unique claiming code that can be given to the pet owner for profile claiming.

**Preconditions:**
- The application is running locally (`docker compose up`)
- Seed data has been loaded (The vet account is associated with a clinic)
- The user is NOT logged in.

**Test Steps:**
1. Log in as the veterinarian (dr.weber@tierarzt-pfoetchen.de / Test1234!).
2. Verify the navigation shows "Search Lost Pets", "Care Snapshot", "Clinic Dashboard", "Pet Profiles", and "Clinic Settings" (in this order).
3. Click "Pet Profiles" in the navigation bar.
4. Click the "Create Medical Profile" button.
5. Enter "Bruno" in the Pet Name field.
6. Enter "Dog" in the Species field.
7. Enter "Dachshund" in the Breed field.
8. Enter "4" in the Age field.
9. Click the "Create Medical Profile" button.
10. Wait for the success confirmation.
11. Note the displayed claiming code (You will need it in the subsequent test case).
12. Navigate back to "Pet Profiles".
13. Verify "Bruno" appears in the list with status "Pending Claim".

**Expected Results:**
- After login, the vet is redirected to the clinic dashboard (not the owner dashboard).
- The navigation shows vet-specific links (Clinic Dashboard, Pet Profiles, Clinic Settings).
- The "Create Medical Profile" form accepts pet medical data (name, species, breed, age).
- After creation, a success message is displayed with:
  - The pet's name ("Bruno")
  - A unique claiming code (format: CLAIM-XXXXXX)
  - Instructions to give the code to the pet owner
- The claiming code is unique and not reused from any existing pet.
- In the Pet Profiles list, "Bruno" appears with status "Pending Claim".
- The profile shows "Verified: Yes" indicator (when clicking on "View Details" button).
- The vet cannot see undertake owner specific actions (Report Missing, Create Care Snapshot).

**Postconditions:** A new pet profile exists with status "Pending Claim". The claiming code can be used by a pet owner to claim the profile. The profile is associated with the vet's clinic.

**Test Data:**
- Vet email: dr.weber@tierarzt-pfoetchen.de
- Vet password: Test1234!
- Pet name: Bruno
- Species: Dog
- Breed: Dachshund
- Age: 4

**Test Environment:**
- Browser: Google Chrome, latest version
- Application: Paw Print Profile v1.0.0 (local Docker environment)
- URL: http://localhost:8080

**Test Case Status:** Pass

**Test Case Notes:** The claiming code format is "CLAIM-" followed by 6 alphanumeric characters. Each code is unique and has an expiry date (30 days by default).

---

## TEST CASE SPECIFICATION 3

**Test Case ID:** TC_CLAIM_003

**Test Case Title:** Verify Pet Profile Claiming with Pre-Populated Contact Details

**Test Case Description:** This test case verifies that a pet owner can claim a pet profile using a claiming code provided by their veterinarian. It also verifies that the owner's previously saved contact details are pre-populated in the claiming form.

**Preconditions:**
- The application is running locally (`docker compose up`)
- Seed data has been loaded
- At least one pet profile has status "Pending Claim"
- The vet account credentials are known (dr.weber@tierarzt-pfoetchen.de / Test1234!), and the user is currently logged in as the vet
- The owner account credentials are known (anna.mueller@beispiel.de / Test1234!)
- TC_VET_002 has been executed (pet "Bruno" exists with claiming code noted)

**Test Steps:**
1. Navigate to the Clinic Dashboard to locate a pet with status "Pending Claim" (e.g., Bruno).
2. Copy the claiming code displayed next to the pending pet (format: CLAIM-XXXXXX).
3. Click "Logout".
4. Log in as the pet owner (anna.mueller@beispiel.de / Test1234!).
5. Click "Claim Profile" in the navigation bar.
6. Verify that the "Your Full Name" field is pre-populated with "Anna Müller".
7. Verify that the "Email Address" field shows "anna.mueller@beispiel.de" and is read-only (greyed out).
8. Verify that the "Phone Number" field is pre-populated with "+49-176-12345678".
9. Paste the claiming code copied in step 2 into the Claiming Code field.
10. Click the "Claim Profile" button.
11. Wait for the success confirmation.

**Expected Results:**
- The Full Name, Email, and Phone fields are pre-populated from the user's saved account profile.
- The Email field is disabled and cannot be edited.
- A helper text "Email is your login address and cannot be changed here." is displayed below the email field.
- After clicking "Claim Profile", a success page is displayed showing:
  - The pet's name (e.g., "Bruno")
  - Status: "Active" (green badge)
  - Owner: "Anna Müller"
  - Claimed timestamp
- Two buttons are shown: "Claim Another" and "Go to My Pets".
- Clicking "Go to My Pets" navigates to the owner dashboard where the newly claimed pet appears.

**Postconditions:** The pet profile is now owned by the pet owner. The claiming code is invalidated and cannot be reused. The pet appears in the owner's "My Pets" dashboard.

**Test Data:**
- Vet email: dr.weber@tierarzt-pfoetchen.de
- Vet password: Test1234!
- Owner email: anna.mueller@beispiel.de
- Owner password: Test1234!
- Claiming code: obtained from vet dashboard (dynamically generated on each seed run, or TC_VET_002)
- Pre-populated name: Anna Müller
- Pre-populated phone: +49-176-12345678

**Test Environment:**
- Browser: Google Chrome, latest version
- Application: Paw Print Profile v1.0.0 (local Docker environment)
- URL: http://localhost:8080

**Test Case Status:** Pass

**Test Case Notes:** The claiming code is generated dynamically during seed data creation and printed to the console as well as displayed on the vet's Clinic Dashboard under "Pending Claims". For testing, make sure you logged in as the vet first to obtain the code, then log out and log in as the owner to perform the claim. If the seed data is re-run, new codes are generated. Using an already-claimed code or an invalid code should display an error message.

---

## TEST CASE SPECIFICATION 4

**Test Case ID:** TC_MISSING_004

**Test Case Title:** Verify 3-Click Missing Pet Flyer Generation from Owner Dashboard

**Test Case Description:** This test case verifies that a pet owner can report their pet as missing and generate a printable flyer in no more than 3 clicks from the main dashboard, satisfying the usability requirement [NFR-USA-01].

**Preconditions:**
- The application is running locally (`docker compose up`)
- Seed data has been loaded
- The user is logged in as the pet owner (anna.mueller@beispiel.de / Test1234!)
- At least one pet has status "Active" (not already missing)

**Test Steps:**
1. Navigate to the "My Pets" page (= main dashboard).
2. Locate an active pet (e.g., "Balu") and click the "Report Missing" button on the pet card (Click 1).
3. An inline form appears with contact method radio buttons (Veterinary Clinic selected by default), a "Last seen location" text field, and an optional notes field.
4. Enter a last seen location (e.g., "Englischer Garten, Munich") in the required field.
5. Optionally change the contact method (e.g., select "My Phone Number").
6. Click "Confirm Report Missing" (Click 2).
7. Wait for the flyer generation to complete.
8. Click "Download Missing Pet Flyer" (Click 3). The PDF flyer is displayed in another tab.
9. Verify what information is visible on the flyer.
10. Click "Logout" (or open a new incognito/private window).
11. Navigate to http://localhost:8080/search.
12. Search for "Dog" and verify that the reported pet now appears in the public search results.

**Expected Results:**
- From the dashboard, the user reaches the "Report Missing" action in at most 3 clicks.
- After reporting, the pet's status changes to "Missing" (visible on the dashboard).
- A PDF flyer download button/link is provided immediately after reporting.
- The flyer contains: pet name, species, breed, age, distinctive features, and contact information.
- If "clinic" contact method is selected, the flyer shows clinic phone and address (NOT owner phone/email).
- If "phone" contact method is selected, the flyer shows the owner's phone number, plus the clinic phone and address.
- The pet now appears in public search results (accessible without login).
- Nearby clinics are notified (verifiable via backend Docker logs or browser Network tab — the API response includes `notifiedClinics` count).
- The "Report Missing" button is replaced with "Mark as Found" on the pet detail page.

**Postconditions:** The pet is marked as missing. A PDF flyer is stored in S3 and available for download. Nearby veterinary clinics have been notified. The pet appears in public search results.

**Test Data:**
- Owner email: anna.mueller@beispiel.de
- Owner password: Test1234!
- Pet: Balu (Golden Retriever, 3y, Active)
- Last seen location: "Englischer Garten, München"
- Contact method: clinic (hides owner personal info)

**Test Environment:**
- Browser: Google Chrome, latest version
- Application: Paw Print Profile v1.0.0 (local Docker environment)
- URL: http://localhost:8080

**Test Case Status:** Pass

**Test Case Notes:** The 3-click requirement is measured from the main dashboard: (1) Report Missing button on pet card → (2) Confirm Report Missing. Form filling (typing location, selecting radio button) does not count as clicks per usability metrics. This satisfies [NFR-USA-01] which requires ≤3 clicks. The PDF flyer is generated server-side using pdfkit and stored in S3 (LocalStack). To verify the PDF content, download it and it opens in another tab. The contact method selection determines what personal information appears on the physical flyer — "Veterinary Clinic Contact" is the privacy-preserving default.

---

## TEST CASE SPECIFICATION 5

**Test Case ID:** TC_SEARCH_005

**Test Case Title:** Verify Public Lost Pet Search Hides Owner Contact Information

**Test Case Description:** This test case verifies that the public lost pet search functionality displays missing pets without exposing the owner's personal contact information (phone number, email address). Instead, clinic contact details and a platform messaging option should be shown.

**Preconditions:**
- The application is running locally (`docker compose up`)
- Seed data has been loaded (at least one pet is marked as "Missing")
- The user is NOT logged in (public access)

**Test Steps:**
1. Navigate to the "Search Lost Pets" Page.
2. Verify that no login is required to access this page, and that you can see: "Susi", "Lotte", "Timmi", "Nala", "Luna", and "Rex", and possibly the missing pet from TC_MISSING_004.
3. Select "Cat" in the Species Dropdown field.
4. Click the "Filter" button.
5. Verify that search results are displayed (e.g. Timmi, Nala, Luna).
6. Review the first result (e.g., "Timmi", Domestic Shorthair).
7. Check what contact information is visible.
8. Look for the clinic contact details.
9. Look for a "Contact Owner Anonymously" or messaging button which leads to a Contact Pet Owner form where you can enter your contact details to contact the pet owner.

**Expected Results:**
- The search page is accessible without authentication.
- Search results show only pets with status "Missing" (Susi, Lotte, Timmi, Nala, Luna, Rex should appear; Balu, Minka, Olive, Askari should NOT – unless one of them had been reported missing in TC_MISSING_004).
- Each result displays: pet name, species, breed, age, and pet images (if available).
- Each result displays the clinic's contact information: clinic name, phone, and address.
- Owner phone number is NOT displayed anywhere in the results.
- Owner email is NOT displayed anywhere in the results.
- A "Contact Owner Anonymously" button leads to an anonymous messaging form.
- Non-missing pets (Active status) do NOT appear in search results.

**Postconditions:** No state changes occur. The search is a read-only operation. No account is created.

**Test Data:**
- Search species: Cat
- Expected results: Timmi (Domestic Shorthair, 6y), Nala (Persian, 3y), Luna (Siamese, 2y)
- Hidden data:
  - markus.becker@beispiel.de, +49-160-4567890
  - anna.mueller@beispiel.de, +49-176-12345678
- Visible clinic:
  - Kleintierpraxis am Dom, +49-221-7773456, Hohenzollernring 55, Köln, Nordrhein-Westfalen
  - Tierarztpraxis Pfötchen, +49-89-1234567, Hauptstrasse 42, Munich, Bavaria

**Test Environment:**
- Browser: Google Chrome, latest version
- Application: Paw Print Profile v1.0.0 (local Docker environment)
- URL: http://localhost:8080

**Test Case Status:** Pass

**Test Case Notes:** This test validates requirement [FR-15] (Owner Privacy Protection). The owner's contact information is stored in the database but intentionally filtered out of public search results. Only the clinic's contact details and a platform messaging URL are exposed. Verify by inspecting the browser's Network tab — the API response should not contain ownerEmail or ownerPhone fields.
