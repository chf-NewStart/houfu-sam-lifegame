"""Build the original 5 x 7 Plank Pixel font. Requires fonttools."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# One hexadecimal bit mask per row, leftmost cell = bit 4.
rows = {
'A':'0e11111f111111','B':'1e11111e11111e','C':'0e11101010110e','D':'1e11111111111e',
'E':'1f10101e10101f','F':'1f10101e101010','G':'0e11101711110f','H':'1111111f111111',
'I':'0e04040404040e','J':'0702020212120c','K':'11121418141211','L':'1010101010101f',
'M':'111b1515111111','N':'11191513111111','O':'0e11111111110e','P':'1e11111e101010',
'Q':'0e11111115120d','R':'1e11111e141211','S':'0f10100e01011e','T':'1f040404040404',
'U':'1111111111110e','V':'11111111110a04','W':'11111115151b11','X':'11110a040a1111',
'Y':'11110a04040404','Z':'1f01020408101f','0':'0e11131519110e','1':'040c040404040e',
'2':'0e11010204081f','3':'1e01010601011e','4':'02060a121f0202','5':'1f10101e01011e',
'6':'0e10101e11110e','7':'1f010204080808','8':'0e11110e11110e','9':'0e11110f01010e',
'.':'00000000000c0c',':':'000c0c000c0c00','!':'04040404040004','?':'0e110102040004',
'-':'0000001f000000','/':'01010204081010','+':'0004041f040400',' ':'00000000000000',
"'":'04040400000000',',':'00000000000c08','(':'02040808080402',')':'08040202020408',
}
fb=FontBuilder(1000,isTTF=True)
order=['.notdef']+[f'uni{ord(ch):04X}' for ch in rows]
fb.setupGlyphOrder(order)
glyphs={};metrics={}
for ch,name in [('', '.notdef')]+[(c,f'uni{ord(c):04X}') for c in rows]:
    pen=TTGlyphPen(None)
    data=rows.get(ch,'1f11151515111f')
    for y in range(7):
        mask=int(data[y*2:y*2+2],16)
        for x in range(5):
            if mask & (1 << (4-x)):
                left,bottom=x*100,(6-y)*100
                pen.moveTo((left,bottom));pen.lineTo((left,bottom+100));pen.lineTo((left+100,bottom+100));pen.lineTo((left+100,bottom));pen.closePath()
    glyphs[name]=pen.glyph();metrics[name]=(600,0)
fb.setupGlyf(glyphs);fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=800,descent=-200)
cmap={ord(c):f'uni{ord(c):04X}' for c in rows}
cmap.update({ord(c.lower()):f'uni{ord(c):04X}' for c in rows if c.isalpha()})
fb.setupCharacterMap(cmap)
fb.setupNameTable({'familyName':'Plank Pixel','styleName':'Regular','uniqueFontIdentifier':'PlankPixel1','fullName':'Plank Pixel','psName':'PlankPixel-Regular'})
fb.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200)
fb.setupPost();fb.setupMaxp();fb.font.flavor='woff'
output=Path(__file__).resolve().parent.parent/'game'/'plank-pixel.woff'
fb.save(output)
