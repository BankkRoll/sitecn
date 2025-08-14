import * as React from "react";
import { SVGProps } from "react";

const TweakcnLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    width="1em"
    height="1em"
    className="size-6"
    {...props}
  >
    <path fill="none" d="M0 0h256v256H0z" />
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={24}
      d="m208 128-.2.2m-39.6 39.6L128 208m64-168-76.2 76.2m-39.6 39.6L40 192"
    />
    <circle
      cx={188}
      cy={148}
      r={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={24}
    />
    <circle
      cx={96}
      cy={136}
      r={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={24}
    />
  </svg>
);
export default TweakcnLogo;
