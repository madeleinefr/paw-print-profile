# Test Case Specifications

This document contains 5 formal test case specifications for the Paw Print Profile application. Each test case describes the expected behavior of the system from a user perspective and can be executed manually against the running application.

**Recommended execution order** (minimizes login/logout cycles):
1. TC_SIGNUP_001 — New pet owner sign-up (no seed data needed)
2. TC_VET_004 — Veterinarian creates pet profile (login as vet)
3. TC_CLAIM_002 — Owner claims profile (starts as vet, switches to owner)
4. TC_MISSING_005 — Owner reports missing pet (login as owner)
5. TC_SEARCH_003 — Public search (no login needed, run last to verify missing pet appears)

---

## TEST CASE SPECIFICATION 1

**Test Case ID:** TC_SIGNUP_001

**Test Case Title:** Verify Pet Owner Sign-Up and Account Settings

**Test Case Description:**
This test case verifies that a new pet owner can successfully create an account, log in, navigate to the Account Settings page, fill in their contact details and address, and have those details persist across page reloads.

**Preconditions:**
- The application is running locally (docker compose up)
- No account exists for the test email address
- The browser has no stored session data (clear cookies/localStorage)

**Test Steps:**
1. Navigate to `http://localhost:8080/signup`.
2. Select "Pet Owner" as the role.
3. Enter "max.mustermann@test.de" in the Email field.
4. Enter "Test1234!" in the Password field.
5. Click the "Sign Up" button.
6. Verify the automatic redirect to the Sign In page.
7. Enter "max.mustermann@test.de" in the Email field.
8. Enter "Test1234!" in the Password field.
9. Click the "Sign In" button.
10. Verify the navigation shows "Search Lost Pets", "Care Snapshots", "My Pets", "Claim Profile", and "Account Settings" (in this order).
11. Click "Account Settings" in the navigation bar.
12. Enter "Max Mustermann" in the Full Name field.
13. Enter "+49-171-9876543" in the Phone Number field.
14. Enter "Berliner Straße" in the Street field.
15. Enter "15" in the Nr. field.
16. Enter "10115" in the PLZ field.
17. Enter "Berlin" in the City field.
18. Click the "Save & Update All Profiles" button.
19. Wait for the success message (displayed above the form).

**Expected Results:**
- After sign-up, the user is automatically redirected to the Sign In page.
- After sign-in, the user is redirected to the owner dashboard.
- The navigation bar shows: Search Lost Pets, Care Snapshots, My Pets, Claim Profile, Account Settings.
- The email field on Account Settings is read-only and shows "max.mustermann@test.de".
- After saving, the message "Contact details saved." is displayed above the form (0 pets, so no propagation).
- All fields retain their values after navigating away and returning to Account Settings (Full Name, Phone, Street, Nr., PLZ, City).
- The Account Overview shows "0" under "My Pets".

**Postconditions:**
The pet owner account exists with saved contact details. The user can now claim pet profiles.

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
- URL: `http://localhost:8080`

**Test Case Status:** Pass

**Test Case Notes:**
The email field is intentionally read-only because it is the login credential. Changing the email requires a verification flow (deferred to post-MVP). The "Contact details saved." message (without pet count) confirms that the user profile is stored independently of pet records.

---

## TEST CASE SPECIFICATION 2

**Test Case ID:** TC_CLAIM_002

**Test Case Title:** Verify Pet Profile Claiming with Pre-Populated Contact Details

**Test Case Description:**
This test case verifies that a pet owner can claim a pet profile using a claiming code provided by their veterinarian. It also verifies that the owner's previously saved contact details are pre-populated in the claiming form.

**Preconditions:**
- The application is running locally (docker compose up)
- Seed data has been loaded (docker compose exec backend npx tsx src/infrastructure/seed-data.ts)
- At least one pet profile has status "Pending Claim"
- The vet account credentials are known (dr.weber@tierarzt-pfoetchen.de / Test1234!)
- The owner account credentials are known (anna.mueller@beispiel.de / Test1234!)
- The user is NOT currently logged in
2. The Clinic Dashboard is displayed after login.
3. Locate a pet with status "Pending Claim" (e.g., Minka or Olive) in the Pending Claims section.
4. Copy the claiming code displayed next to the pending pet (format: CLAIM-XXXXXX).
5. Click "Logout".
6. Log in as the pet owner (anna.mueller@beispiel.de / Test1234!).
7. Click "Claim Profile" in the navigation bar.
8. Verify that the "Your Full Name" field is pre-populated with "Anna Müller".
9. Verify that the "Email Address" field shows "anna.mueller@beispiel.de" and is read-only (greyed out).
10. Verify that the "Phone Number" field is pre-populated with "+49-176-12345678".
11. Paste the claiming code copied in step 4 into the Claiming Code field.
12. Click the "Claim Profile" button.
13. Wait for the success confirmation.

**Expected Results:**
- The Full Name, Email, and Phone fields are pre-populated from the user's saved account profile.
- The Email field is disabled and cannot be edited.
- A helper text "Email is your login address and cannot be changed here." is displayed below the email field.
- After clicking "Claim Profile", a success page is displayed showing:
  - The pet's name (e.g., "Minka")
  - Status: "Active" (green badge)
  - Owner: "Anna Müller"
  - Claimed timestamp
- Two buttons are shown: "Claim Another" and "Go to My Pets".
- Clicking "Go to My Pets" navigates to the owner dashboard where the newly claimed pet appears.

**Postconditions:**
The pet profile is now owned by the pet owner. The claiming code is invalidated and cannot be reused. The pet appears in the owner's "My Pets" dashboard.

**Test Data:**
- Vet email: dr.weber@tierarzt-pfoetchen.de
- Vet password: Test1234!
- Owner email: anna.mueller@beispiel.de
- Owner password: Test1234!
- Claiming code: obtained from vet dashboard (dynamically generated on each seed run)
- Pre-populated name: Anna Müller
- Pre-populated phone: +49-176-12345678

**Test Environment:**
- Browser: Google Chrome, latest version
- Application: Paw Print Profile v1.0.0 (local Docker environment)
- URL: `http://localhost:8080`

**Test Case Status:** Pass

**Test Case Notes:**
The claiming code is generated dynamically during seed data creation and displayed on the vet's Clinic Dashboard under "Pending Claims". The professor should log in as the vet first to obtain the code, then log out and log in as the owner to perform the claim. Using an already-claimed code or an invalid code should display an error message.

---

## TEST CASE SPECIFICATION 3

**Test Case ID:** TC_SEARCH_003

**Test Case Title:** Verify Public Lost Pet Search Hides Owner Contact Information

**Test Case Description:**
This test case verifies that the public lost pet search functionality displays missing pets without exposing the owner's personal contact information (phone number, email address). Instead, clinic contact details and a platform messaging option should be shown.

**Preconditions:**
- The application is running locally (docker compose up)
- Seed data has been loaded (at least one pet is marked as "Missing")
- The user is NOT logged in (public access)

**Test Steps:**
1. Navigate to `http://localhost:8080/search`.
2. Verify that no login is required to access this page.
3. Enter "Cat" in the Species field.
4. Click the "Search" button.
5. Verify that search results are displayed.
6. Review the first result (e.g., "Luna", Siamese).
7. Check what contact information is visible.
8. Look for the clinic contact details.
9. Look for a "Contact Owner Anonymously" button.

**Expected Results:**
- The search page is accessible without authentication.
- Search results show only pets with status "Missing" (Luna, Nala, Timmi should appear; Balu should NOT).
- Each result displays: pet name, species, breed, age, and pet images (if seed-images script was run).
- Each result displays the clinic's contact information: clinic name, phone, and address.
- Owner phone number is NOT displayed anywhere in the results.
- Owner email is NOT displayed anywhere in the results.
- A "Contact Owner Anonymously" button is provided that leads to an anonymous messaging form.
- Non-missing pets (Active status) do NOT appear in search results.

**Postconditions:**
No state changes occur. The search is a read-only operation. No account is created.

**Test Data:**
- Search species: Cat
- Expected results: Luna (Siamese, 2y), Nala (Persian, 3y)
- Hidden data: anna.mueller@beispiel.de, +49-176-12345678
- Visible clinic: Tierarztpraxis Pfötchen, +49-89-1234567

**Test Environment:**
- Browser: Google Chrome, latest version
- Application: Paw Print Profile v1.0.0 (local Docker environment)
- URL: `http://localhost:8080`

**Test Case Status:** Pass

**Test Case Notes:**
This test validates requirement [FR-15] (Owner Privacy Protection). The owner's contact information is stored in the database but intentionally filtered out of public search results. Only the clinic's contact details and a platform messaging URL are exposed. Verify by inspecting the browser's Network tab — the API response should not contain ownerEmail or ownerPhone fields.

---

## TEST CASE SPECIFICATION 4

**Test Case ID:** TC_VET_004

**Test Case Title:** Verify Veterinarian Creates Medical Pet Profile with Claiming Code

**Test Case Description:**
This test case verifies that a veterinarian can create a new medically verified pet profile from the clinic dashboard. Upon creation, the system generates a unique claiming code that can be given to the pet owner for profile claiming.

**Preconditions:**
- The application is running locally (docker compose up)
- Seed data has been loaded
- The user is logged in as the veterinarian (dr.weber@tierarzt-pfoetchen.de / Test1234!)
- The vet account is associated with a clinic

**Test Steps:**
1. Log in as the veterinarian (dr.weber@tierarzt-pfoetchen.de / Test1234!).
2. Verify the navigation shows "Search Lost Pets", "Care Snapshots", "Clinic Dashboard", "Pet Profiles", and "Clinic Settings".
3. Click "Pet Profiles" in the navigation bar.
4. Click the "Create New Profile" button.
5. Enter "Bruno" in the Pet Name field.
6. Enter "Dog" in the Species field.
7. Enter "Dachshund" in the Breed field.
8. Enter "4" in the Age field.
9. Click the "Create Profile" button.
10. Wait for the success confirmation.
11. Note the displayed claiming code.
12. Navigate back to "Pet Profiles".
13. Verify "Bruno" appears in the list with status "Pending Claim".

**Expected Results:**
- After login, the vet is redirected to the vet dashboard (not the owner dashboard).
- The navigation shows vet-specific links (Clinic Dashboard, Pet Profiles, Clinic Settings).
- The "Create New Profile" form accepts pet medical data (name, species, breed, age).
- After creation, a success message is displayed with:
  - The pet's name ("Bruno")
  - A unique claiming code (format: CLAIM-XXXXXX)
  - Instructions to give the code to the pet owner
- The claiming code is unique and not reused from any existing pet.
- In the Pet Profiles list, "Bruno" appears with status "Pending Claim".
- The profile shows "Medically Verified" indicator.
- The vet cannot see owner-specific actions (Report Missing, Care Snapshot).

**Postconditions:**
A new pet profile exists with status "Pending Claim". The claiming code can be used by a pet owner to claim the profile. The profile is associated with the vet's clinic.

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
- URL: `http://localhost:8080`

**Test Case Status:** Pass

**Test Case Notes:**
The claiming code format is "CLAIM-" followed by 6 alphanumeric characters. Each code is unique and has an expiry date. If the vet is not associated with a clinic, the "Create New Profile" button should not be available (or should show an error prompting clinic registration first).

---

## TEST CASE SPECIFICATION 5

**Test Case ID:** TC_MISSING_005

**Test Case Title:** Verify 3-Click Missing Pet Flyer Generation from Owner Dashboard

**Test Case Description:**
This test case verifies that a pet owner can report their pet as missing and generate a printable flyer in no more than 3 clicks from the main dashboard, satisfying the usability requirement [NFR-USA-01].

**Preconditions:**
- The application is running locally (docker compose up)
- Seed data has been loaded
- The user is logged in as the pet owner (anna.mueller@beispiel.de / Test1234!)
- At least one pet has status "Active" (not already missing)

**Test Steps:**
1. Log in as the pet owner (anna.mueller@beispiel.de / Test1234!).
2. The "My Pets" dashboard is displayed after login.
3. Locate an active pet (e.g., "Balu") and click the "Report Missing" button on the pet card (Click 1).
4. An inline form appears with: contact method radio buttons (Vet Clinic selected by default), a "Last seen location" text field, and an optional notes field.
5. Enter a last seen location (e.g., "Englischer Garten, München") in the required field.
6. Optionally change the contact method (e.g., select "My Phone Number").
7. Click "Confirm Report Missing" (Click 2).
8. Wait for the flyer generation to complete.
9. Verify a download link for the PDF flyer is displayed.
10. Click "Logout" (or open a new incognito/private window).
11. Navigate to `http://localhost:8080/search`.
12. Search for "Dog" and verify that the reported pet now appears in the public search results.

**Expected Results:**
- From the dashboard, the user reaches the flyer result in 2 clicks + form input (within the 3-click requirement).
- After reporting, the pet's status changes to "Missing" (visible on the dashboard with a red badge).
- A PDF flyer download link is provided immediately after reporting.
- The flyer contains: pet name, species, breed, age, distinctive features, pet photo, and contact information.
- If "Veterinary Clinic Contact" is selected (default), the flyer shows clinic phone and address (NOT owner phone/email).
- If "My Phone Number" is selected, the flyer shows only the owner's phone number.
- The pet now appears in public search results (accessible without login).
- Nearby clinics are notified (verifiable via backend Docker logs or browser Network tab — the API response includes `notifiedClinics` count).
- The "Report Missing" button is replaced with "Mark as Found" on the pet card.

**Postconditions:**
The pet is marked as missing. A PDF flyer is stored in S3 and available for download. Nearby veterinary clinics have been notified. The pet appears in public search results.

**Test Data:**
- Owner email: anna.mueller@beispiel.de
- Owner password: Test1234!
- Pet: Balu (Golden Retriever, 3y, Active)
- Last seen location: "Englischer Garten, München"
- Contact method: clinic (hides owner personal info)

**Test Environment:**
- Browser: Google Chrome, latest version
- Application: Paw Print Profile v1.0.0 (local Docker environment)
- URL: `http://localhost:8080`

**Test Case Status:** Pass

**Test Case Notes:**
The 2-click requirement is measured from the dashboard: (1) Report Missing button on pet card → (2) Confirm Report Missing. Form filling (typing location, selecting radio button) does not count as clicks per usability metrics. This satisfies [NFR-USA-01] which requires ≤3 clicks. The PDF flyer is generated server-side using pdfkit with sharp for image format conversion (WebP→PNG) and stored in S3 (LocalStack). To verify the PDF content, download it and open in a PDF viewer. The contact method selection determines what personal information appears on the physical flyer — "Veterinary Clinic Contact" is the privacy-preserving default. An alternative path via the pet detail page is also available for users who are already viewing a specific pet.
