import base from "./consumer-playwright.config";
import { linuxWebkitConfig } from "./linux-webkit-config";
export default linuxWebkitConfig(base, "consumer", true);
