// Universal Providers — domain registration (side-effect module).
//
// Import this from any server entry that calls getService()/hasService()
// (the generic dashboard API + health checks) so every wired domain service is
// registered before use. Kept separate from services.ts to avoid a circular
// import (domains import registerService from services.ts).
//
// As each domain phase lands, add its side-effect import here.

import "./ai";
import "./email";
import "./sms";
import "./speech";
import "./image";
