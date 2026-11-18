import base from "../playwright.config";
import { linuxWebkitConfig } from "./linux-webkit-config";
export default linuxWebkitConfig(base, "e2e");
