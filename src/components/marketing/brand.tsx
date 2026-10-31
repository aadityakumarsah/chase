import Image from "next/image";
import Link from "next/link";
import styles from "./marketing.module.css";

export function ChaseBrand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={styles.brand} aria-label="Chase home">
      <Image src="/assets/chase-mascot.webp" width={48} height={44} alt="" />
      <span>
        chase<span className={styles.brandDot}>.</span>
      </span>
    </Link>
  );
}
