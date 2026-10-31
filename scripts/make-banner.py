"""生成 README banner：深色、克制、只放能说明产品的东西。

640x160 的逻辑尺寸按 4 倍渲染（2560x640），缩到 1280 宽显示仍然锐利。
"""
from PIL import Image, ImageDraw, ImageFont

W, H, SCALE = 640, 160, 4
w, h = W * SCALE, H * SCALE

BG = (14, 16, 19)
GRID = (24, 27, 32)
TITLE = (232, 234, 237)
MUTED = (154, 160, 166)
FAINT = (95, 99, 104)
ACCENT = (34, 197, 94)
CAPSULE_BG = (22, 25, 30)
CAPSULE_BORDER = (42, 47, 54)

FONT_BOLD = "C:/Windows/Fonts/seguisb.ttf"
FONT_REG = "C:/Windows/Fonts/segoeui.ttf"
FONT_MONO = "C:/Windows/Fonts/consola.ttf"


def px(v):
    return int(round(v * SCALE))


def font(path, size):
    return ImageFont.truetype(path, px(size))


img = Image.new("RGB", (w, h), BG)
d = ImageDraw.Draw(img)

# 极淡的方格，暗示"方块"，不抢文字
step = px(16)
for x in range(0, w, step):
    d.line([(x, 0), (x, h)], fill=GRID, width=1)
for y in range(0, h, step):
    d.line([(0, y), (w, y)], fill=GRID, width=1)


def cube(cx, cy, s, alpha_lines):
    """等轴测方块：只画轮廓，三个面。"""
    dx = s * 0.866
    top = [(cx, cy - s * 0.5), (cx + dx, cy), (cx, cy + s * 0.5), (cx - dx, cy)]
    left = [(cx - dx, cy), (cx, cy + s * 0.5), (cx, cy + s * 1.5), (cx - dx, cy + s)]
    right = [(cx + dx, cy), (cx, cy + s * 0.5), (cx, cy + s * 1.5), (cx + dx, cy + s)]
    for poly in (top, left, right):
        for i in range(len(poly)):
            a = poly[i]
            b = poly[(i + 1) % len(poly)]
            d.line([(px(a[0]), px(a[1])), (px(b[0]), px(b[1]))], fill=alpha_lines, width=px(0.4))


cube(548, 58, 22, (34, 58, 44))
cube(592, 40, 13, (30, 50, 39))
cube(600, 84, 17, (28, 46, 36))

# 左侧强调竖条
d.rectangle([px(28), px(28), px(30), px(132)], fill=ACCENT)

# 小标签
d.text((px(44), px(30)), "DSH PLUGIN", font=font(FONT_BOLD, 8), fill=FAINT)

# 标题与副标题
d.text((px(44), px(46)), "minecraft-dev-starter", font=font(FONT_BOLD, 25), fill=TITLE)
d.text(
    (px(44), px(84)),
    "Detect a Minecraft mod project. Launch it from the session header.",
    font=font(FONT_REG, 9),
    fill=MUTED,
)

# 胶囊示意：状态点 + 目标名 + 播放键
cap_x, cap_y, cap_w, cap_h = 44, 108, 132, 24
d.rounded_rectangle([px(cap_x), px(cap_y), px(cap_x + cap_w), px(cap_y + cap_h)], radius=px(5), fill=CAPSULE_BG, outline=CAPSULE_BORDER, width=1)
d.ellipse([px(cap_x + 10), px(cap_y + 9), px(cap_x + 16), px(cap_y + 15)], fill=ACCENT)
d.text((px(cap_x + 22), px(cap_y + 6)), "Client", font=font(FONT_REG, 9), fill=TITLE)
# 播放三角
tx, ty = px(cap_x + cap_w - 16), px(cap_y + 8)
d.polygon([(tx, ty), (tx, ty + px(8)), (tx + px(7), ty + px(4))], fill=MUTED)

# 右下角仓库地址
d.text(
    (px(636) - d.textlength("github.com/Chemiofitor4096/minecraft-dev-starter", font=font(FONT_MONO, 7)), px(132)),
    "github.com/Chemiofitor4096/minecraft-dev-starter",
    font=font(FONT_MONO, 7),
    fill=FAINT,
)

img.save("C:/Projects/minecraft-dev-starter/assets/banner.png", optimize=True)
print("saved", img.size)
