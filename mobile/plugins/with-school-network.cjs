const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// The school's documented teaching portal uses HTTP. Scope the exception to that exact host.
module.exports = function withSchoolNetwork(config) {
  config = withAndroidManifest(config, result => {
    result.modResults.manifest.application[0].$['android:networkSecurityConfig'] = '@xml/liubai_school_network';
    return result;
  });
  return withDangerousMod(config, ['android', async result => {
    const folder = path.join(result.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'liubai_school_network.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">jw.hitsz.edu.cn</domain></domain-config>
</network-security-config>
`);
    return result;
  }]);
};
