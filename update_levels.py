import json

with open('rkas_data.json', 'r', encoding='utf-8') as f:
    items = json.load(f)

for item in items:
    is_hdr = item.get('is_header', False)
    prog = (item.get('kode_program') or '').strip()
    dots = prog.count('.')
    
    if is_hdr:
        if dots == 1:
            item['level'] = 1  # Standar (e.g. 02.)
            item['level_name'] = 'STANDAR'
        elif dots == 2:
            item['level'] = 2  # Program (e.g. 02.03.)
            item['level_name'] = 'PROGRAM'
        else:
            item['level'] = 3  # Sub-Kegiatan (e.g. 02.03.01.)
            item['level_name'] = 'KEGIATAN'
    else:
        item['level'] = 4      # Item Belanja
        item['level_name'] = 'ITEM'

with open('rkas_data.json', 'w', encoding='utf-8') as f:
    json.dump(items, f, ensure_ascii=False, indent=2)

with open('data.js', 'w', encoding='utf-8') as f:
    f.write('const INITIAL_RKAS_DATA = ' + json.dumps(items, ensure_ascii=False) + ';')

print("Classified all rows into levels 1, 2, 3, 4 successfully!")
