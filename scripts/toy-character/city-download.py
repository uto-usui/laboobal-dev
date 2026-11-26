"""Keep the official archives and their bundled CC0 notices together."""
import concurrent.futures
import http.cookiejar
import hashlib
import json
from pathlib import Path
import re
import urllib.request
import zipfile

root = Path('.work/toy-character/city/vendor')
root.mkdir(parents=True, exist_ok=True)

def download(kit):
    page = f'https://kenney.nl/assets/city-kit-{kit}'
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    html = opener.open(page).read()
    (root / f'{kit}-source.html').write_bytes(html)
    identifier = re.search(rb"data-download-id='([^']+)'", html)[1].decode()
    endpoint = 'https://kenney.nl/download-link/' + identifier
    request = urllib.request.Request(endpoint, headers={'Referer': page, 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest'})
    link = json.load(opener.open(request))['url']
    data = opener.open(urllib.request.Request(link, headers={'Referer': page})).read()
    archive = root / f'kenney-city-kit-{kit}.zip'
    archive.write_bytes(data)
    with zipfile.ZipFile(archive) as z:
        z.extractall(root / kit)
    return dict(kit=kit, source=page, archive=str(archive), archiveBytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(), license='CC0-1.0',
                licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/')

with concurrent.futures.ThreadPoolExecutor() as pool:
    sources = list(pool.map(download, ['suburban', 'roads', 'commercial']))
(root / 'sources.json').write_text(json.dumps(sources, indent=2) + '\n')
print(json.dumps(sources, indent=2))
