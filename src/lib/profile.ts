/**
 * The company profile the fit score is judged against. This default comes
 * straight from the challenge brief. Users can extend it in the UI (years in
 * business, certifications, insurance, past projects); every fact added turns
 * an "unknown" eligibility check into a definite "meets" or "gap".
 */
export const DEFAULT_PROFILE = `Company: idiaz.io
Type: US-registered, AI-native engineering studio with a small senior team.
What we build:
- Automation platforms
- Compliance tooling
- AI-integrated ops software
- Web and mobile apps
Delivery model: software engineering services, delivered remotely within the US.
We do NOT do: construction, facilities/janitorial, staffing-only labor, hardware supply, or other non-software work.

Unknown unless added below: years in business, headcount, revenue, state registrations, certifications (SOC 2, ISO 27001, FedRAMP), insurance limits, bonding capacity, security clearances, past public-sector projects.`;

export const PROFILE_HINT =
  "Add facts the agent can't know: years in business, employee count, annual revenue, states registered in, certifications (SOC 2, ISO 27001), insurance limits, past public-sector or regulated-industry projects.";

export const MAX_PROFILE_CHARS = 6000;
