# 工程9の画像生成

Codex 内蔵 image_gen。編集対象は工程8の照明なし正面正投影レンダ、参照は同じ範囲のv4の顔。生成した肌・眉・鼻・髪は採らず、目の内側だけを使用する。位置合わせと切り出しは eyes_images.py で再実行する。

## open

Use case: precise-object-edit. Asset: layered eye texture for a stylized toy character. Image 1 is the EDIT TARGET: a 1024x1024 front orthographic unlit face render. Image 2 is the v4 DESIGN REFERENCE for eye shape and line quality only (ignore its glasses). Preserve image 1's exact 1024x1024 canvas, framing, scale, eye locations (left eye corners approx 284,400 and 433,409; right 592,409 and 735,400). Keep all skin, hair, mouth, nose and clothing unchanged outside the eye region. No glasses, eyebrows, text, diagram or labels. Eye artwork should have v4's clean rounded almond opening, warm dark brown upper lash/eyelid line and delicate lower lid, smoothly painted toy style, no photographic noise. Do not add realistic pores or change the model silhouette. Change only both eye regions: fully OPEN eyes with ivory white sclera, upper lashes and eyelid contour, but ABSOLUTELY NO IRIS, NO PUPIL, NO BLACK DISK, no reflections in the whites. Each white opening is empty and uniform ivory, suitable for adding the iris as a separate layer. Retain the exact eye inner/outer corner positions.

referenced_image_paths: `.work/toy-character/eyes/face-front-unlit.png`, `.work/toy-character/eyes/v4-face.png`。transparent_background: false.

## half

Use case: precise-object-edit. Asset: layered eye texture for a stylized toy character. Image 1 is the EDIT TARGET: a 1024x1024 front orthographic unlit face render. Image 2 is the v4 DESIGN REFERENCE for eye shape and line quality only (ignore its glasses). Preserve image 1's exact 1024x1024 canvas, framing, scale, eye locations (left eye corners approx 284,400 and 433,409; right 592,409 and 735,400). Keep all skin, hair, mouth, nose and clothing unchanged outside the eye region. No glasses, eyebrows, text, diagram or labels. Eye artwork should have v4's clean rounded almond opening, warm dark brown upper lash/eyelid line and delicate lower lid, smoothly painted toy style, no photographic noise. Do not add realistic pores or change the model silhouette. Change only both eye regions: HALF CLOSED eyelids, with upper lids lowered halfway, softly curved, narrow ivory sclera opening remaining below them. ABSOLUTELY NO IRIS, NO PUPIL, NO BLACK DISK. The lower lid remains at its original position, and eye inner/outer corners remain in exactly the original locations. Paint upper lid using the edit target's flat peach skin color, with a clean dark brown eyelid/lash edge.

referenced_image_paths: `.work/toy-character/eyes/face-front-unlit.png`, `.work/toy-character/eyes/v4-face.png`。transparent_background: false.

## closed

Use case: precise-object-edit. Asset: layered eye texture for a stylized toy character. Image 1 is the EDIT TARGET: a 1024x1024 front orthographic unlit face render. Image 2 is the v4 DESIGN REFERENCE for eye shape and line quality only (ignore its glasses). Preserve image 1's exact 1024x1024 canvas, framing, scale, eye locations (left eye corners approx 284,400 and 433,409; right 592,409 and 735,400). Keep all skin, hair, mouth, nose and clothing unchanged outside the eye region. No glasses, eyebrows, text, diagram or labels. Eye artwork should have v4's clean rounded almond opening, warm dark brown upper lash/eyelid line and delicate lower lid, smoothly painted toy style, no photographic noise. Do not add realistic pores or change the model silhouette. Change only both eye regions: fully CLOSED eyes in a relaxed natural blink. No white sclera, no iris, no pupil. Peach skin matching the target seamlessly fills the entire old eye opening. A single soft curved dark brown closed eyelid/lash line connects each original eye's corners, gently bending downward in the middle. Do not add brows or change any other feature.

referenced_image_paths: `.work/toy-character/eyes/face-front-unlit.png`, `.work/toy-character/eyes/v4-face.png`。transparent_background: false.

## iris

Use case: background-extraction. Asset: separate iris layer for eye animation. Image 1 sets the exact 1024x1024 canvas and iris centers (left approx 365,410 and right approx 646,410). Image 2 is v4 eye appearance reference. Create ONLY two round brown irises with black pupils, warm dark brown outer rims and a small white upper-left specular light per iris, matching v4's soft toy appearance. Diameter 88 pixels each, centers at (365,410),(646,410), on this exact full 1024x1024 canvas. Everything else must be truly transparent: no face, skin, hair, whites, eyelids, glasses, extra objects, text or labels. Entire iris disks including their brown color and white light must be opaque; smooth round edges. Both circles same size and parallel front view.

referenced_image_paths: `.work/toy-character/eyes/face-front-unlit.png`, `.work/toy-character/eyes/v4-face.png`。transparent_background: true.
