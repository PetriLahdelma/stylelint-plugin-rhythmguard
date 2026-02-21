# Real Before/After Diffs (Public Codebases)

These examples are extracted from public repositories and run through Rhythmguard with autofix enabled.

## Source repositories

- [PetriLahdelma/digitaltableteur-nextjs](https://github.com/PetriLahdelma/digitaltableteur-nextjs)
- [PetriLahdelma/digitaltableteur](https://github.com/PetriLahdelma/digitaltableteur)

## Example 1: Header spacing normalization

Source: [`digitaltableteur-nextjs/app/components/Header/Header.module.css`](https://github.com/PetriLahdelma/digitaltableteur-nextjs/blob/main/app/components/Header/Header.module.css#L28)

```diff
 .headerInner {
-  padding: 14px 0;
+  padding: 12px 0;
 }
```

## Example 2: Mobile header spacing

Source: [`digitaltableteur-nextjs/app/components/Header/Header.module.css`](https://github.com/PetriLahdelma/digitaltableteur-nextjs/blob/main/app/components/Header/Header.module.css#L150)

```diff
 @media (width <= 900px) {
   .headerInner {
-    padding: 10px 16px;
+    padding: 8px 16px;
   }
 }
```

## Example 3: Gallery gap consistency

Source: [`digitaltableteur/nextjs-app/shared/components/Gallery/Gallery.module.css`](https://github.com/PetriLahdelma/digitaltableteur/blob/main/nextjs-app/shared/components/Gallery/Gallery.module.css#L77)

```diff
 @media (width <= 900px) {
   .gallery {
-    gap: 20px;
+    gap: 16px;
   }

   .column {
-    gap: 20px;
+    gap: 16px;
   }
 }
```

## Example 4: Motion offset scale alignment

Source: [`digitaltableteur/nextjs-app/shared/components/NewsletterWaitlist/NewsletterWaitlist.module.css`](https://github.com/PetriLahdelma/digitaltableteur/blob/main/nextjs-app/shared/components/NewsletterWaitlist/NewsletterWaitlist.module.css#L99)

```diff
 @keyframes fade-in-up {
   from {
-    transform: translateY(10px);
+    transform: translateY(8px);
     opacity: 0;
   }
 }
```

## Lint output before fix

Command:

```bash
npx stylelint /tmp/rhythmguard-real-examples.before.css --config /tmp/rhythmguard-real-examples.stylelintrc.json --formatter string
```

Output:

```text
../../../../tmp/rhythmguard-real-examples.before.css
   3:12  ✖  Unexpected off-scale value "14px". Use scale values (nearest: 12px or 16px).             rhythmguard/use-scale
   8:14  ✖  Unexpected off-scale value "10px". Use scale values (nearest: 8px or 12px).              rhythmguard/use-scale
  15:10  ✖  Unexpected off-scale value "20px". Use scale values (nearest: 16px or 24px).             rhythmguard/use-scale
  19:10  ✖  Unexpected off-scale value "20px". Use scale values (nearest: 16px or 24px).             rhythmguard/use-scale
  26:27  ✖  Unexpected off-scale value "10px". Use scale values (nearest: 8px or 12px).              rhythmguard/use-scale
  26:27  ✖  Unexpected transform translation value "10px". Use scale values (nearest: 8px or 12px).  rhythmguard/no-offscale-transform

✖ 6 problems (6 errors, 0 warnings)
  6 errors potentially fixable with the "--fix" option.
```

## Lint output after fix

Command:

```bash
npx stylelint /tmp/rhythmguard-real-examples.css --config /tmp/rhythmguard-real-examples.stylelintrc.json --formatter string
```

Output: no violations.

