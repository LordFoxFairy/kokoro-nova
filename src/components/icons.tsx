import type { SVGProps } from 'react'

/**
 * Inline stroke icons drawn on a 24-unit grid at 1.6 stroke width, so they sit
 * evenly next to 13–14px Chinese text without looking heavier than the labels.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M4 11h11M4 16h14M4 20h8" />
  </Icon>
)

export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="8.6" cy="9.8" r="1.5" />
    <path d="m3.6 17 4.6-4.4a2 2 0 0 1 2.7 0l3 2.8m0 0 2-1.8a2 2 0 0 1 2.7 0l1.8 1.7m-6.5.1 2.4 2.3" />
  </Icon>
)

export const IconVideo = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="14" height="14" rx="2.5" />
    <path d="m17 10.5 3.4-2.3a.8.8 0 0 1 1.3.7v6.2a.8.8 0 0 1-1.3.7L17 13.5z" />
  </Icon>
)

export const IconComposite = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h7v10H4zM13 7h7v4h-7zM13 13h7v4h-7z" />
  </Icon>
)

export const IconDirector = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3 8.5 4.6L12 12.2 3.5 7.6z" />
    <path d="m3.5 12 8.5 4.6 8.5-4.6M3.5 16.4 12 21l8.5-4.6" />
  </Icon>
)

export const IconAudio = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10.5v3M8 7v10M12 4.5v15M16 8.5v7M20 10.5v3" />
  </Icon>
)

export const IconScript = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
    <path d="M8 8.5h8M8 12h8M8 15.5h5" />
  </Icon>
)

export const IconStyle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.2 0 1.8-.8 1.8-1.7 0-1.6-1.2-1.9-1.2-3 0-.9.7-1.6 1.7-1.6h1.6a4.9 4.9 0 0 0 4.9-4.9c0-3.6-3.9-6.4-8.8-6.4Z" />
    <circle cx="8" cy="10" r="1.1" />
    <circle cx="12" cy="7.6" r="1.1" />
    <circle cx="16" cy="10" r="1.1" />
  </Icon>
)

export const IconEffect = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M18 16.5 18.8 19l2.2.8-2.2.8L18 23l-.8-2.4-2.2-.8 2.2-.8z" />
  </Icon>
)

export const IconAssetLibrary = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M3 9h18M9 9v11" />
  </Icon>
)

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
)

export const IconCursor = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 3.4 19 11l-6.2 1.5L10.4 19z" />
  </Icon>
)

export const IconToolbox = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="7" r="2.4" />
    <circle cx="18" cy="7" r="2.4" />
    <circle cx="12" cy="18" r="2.4" />
    <path d="M7.6 8.8 11 15.9M16.4 8.8 13 15.9M8.4 7h7.2" />
  </Icon>
)

export const IconMaterial = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 4 8l8 4.5L20 8z" />
    <path d="m4 12.5 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
  </Icon>
)

export const IconCharacter = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
  </Icon>
)

export const IconHistory = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.2V12l3.2 2" />
  </Icon>
)

export const IconKeyboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
    <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.6h.01M9.5 13.6h5M18 13.6h.01" />
  </Icon>
)

export const IconHelp = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
    <path d="M12 17h.01" />
  </Icon>
)

export const IconSidebar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </Icon>
)

export const IconArrange = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Icon>
)

export const IconMinimap = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3.5 6.5 5.5-2.4 6 2.4 5.5-2.4v13.4L15 19.9l-6-2.4-5.5 2.4z" />
    <path d="M9 4.1v13.4M15 6.5v13.4" />
  </Icon>
)

export const IconEdges = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="18" cy="18" r="2.4" />
    <path d="M8.4 6H14a2 2 0 0 1 2 2v7.6" />
  </Icon>
)

export const IconMagnet = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4v7a6 6 0 0 0 12 0V4" />
    <path d="M6 9h4M14 9h4" />
  </Icon>
)

export const IconWorkflow = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="7" height="6" rx="1.6" />
    <rect x="14" y="14" width="7" height="6" rx="1.6" />
    <path d="M10 7h4a3.5 3.5 0 0 1 3.5 3.5V14" />
  </Icon>
)

export const IconStoryboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M9.5 4.5v15M15 4.5v15" />
  </Icon>
)

export const IconAgent = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="6.5" width="17" height="12" rx="3.5" />
    <path d="M8.6 11.4v1.6M15.4 11.4v1.6M12 3.4v3.1" />
  </Icon>
)

export const IconShare = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="17.5" cy="5.8" r="2.5" />
    <circle cx="6.5" cy="12" r="2.5" />
    <circle cx="17.5" cy="18.2" r="2.5" />
    <path d="m8.8 10.8 6.4-3.6M8.8 13.2l6.4 3.6" />
  </Icon>
)

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9.5 6 5.5 6-5.5" />
  </Icon>
)

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9.5 6 5.5 6-5.5 6" />
  </Icon>
)

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 6 9 12l5.5 6" />
  </Icon>
)

export const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconExpand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5V4h5.5M20 14.5V20h-5.5M4 4l6 6M20 20l-6-6" />
  </Icon>
)

export const IconCollapse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 4v5.5H4M14.5 20v-5.5H20M4 9.5 9.5 4M20 14.5 14.5 20" />
  </Icon>
)

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.6 18.4 12 8 18.4z" />
  </Icon>
)

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5.5v13M15 5.5v13" />
  </Icon>
)

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16V4.5M8 8.2 12 4.2l4 4M4.5 15v3.4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
  </Icon>
)

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11.5M8 11.8l4 4 4-4M4.5 15v3.4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
  </Icon>
)

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
    <path d="M6.5 6.5 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.8-12.5" />
    <path d="M10.4 10v6.6M13.6 10v6.6" />
  </Icon>
)

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.2" />
    <path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Icon>
)

export const IconRename = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h16" />
    <path d="M14.8 4.6a1.9 1.9 0 0 1 2.7 2.7L8.9 15.9l-3.5.9.9-3.5z" />
  </Icon>
)

export const IconFolder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h3.3l2 2.4h7.7a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </Icon>
)

export const IconFolderPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h3.3l2 2.4h7.7a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    <path d="M12 11.4v5M9.5 13.9h5" />
  </Icon>
)

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.6" />
    <path d="m15.8 15.8 4.2 4.2" />
  </Icon>
)

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
)

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.6 4.6 4.6L19 7" />
  </Icon>
)

export const IconCredit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.4 3 5.6 13.4h5l-.9 7.6 8-10.6h-5z" />
  </Icon>
)

export const IconGroup = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8V5.5a1.5 1.5 0 0 1 1.5-1.5H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" />
  </Icon>
)

export const IconGrid = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
  </Icon>
)

export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.4 1.4" />
    <path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.4-1.4" />
  </Icon>
)

export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.4 4v4.4H16" />
  </Icon>
)

export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
  </Icon>
)

export const IconAt = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a2.6 2.6 0 0 0 5.2 0v-1a9.2 9.2 0 1 0-3.6 7.3" />
  </Icon>
)

export const IconAttachment = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11.5 12.2 19.3a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3.1 3.1 0 0 1 4.4 4.4l-7.8 7.8a1.5 1.5 0 0 1-2.2-2.2l7-7" />
  </Icon>
)

export const IconSparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 4 1.7 4.8L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.2z" />
  </Icon>
)

export const IconSkill = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 14.5 9l6 .6-4.5 4 1.3 5.9L12 16.4 6.7 19.5 8 13.6l-4.5-4L9.5 9z" />
  </Icon>
)

export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
)

export const IconCut = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6.5" cy="17.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
    <path d="M8.3 15.7 18 4M15.7 15.7 6 4" />
  </Icon>
)

export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 3.5 8 12 12.5 20.5 8z" />
    <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
  </Icon>
)

export const IconLocate = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4" />
  </Icon>
)

export const IconUndo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H8" />
    <path d="M7.5 5.5 4 9l3.5 3.5" />
  </Icon>
)

export const IconRedo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H16" />
    <path d="M16.5 5.5 20 9l-3.5 3.5" />
  </Icon>
)

export const IconHand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 11V5.6a1.6 1.6 0 0 1 3.2 0V11m0-.6V4.8a1.6 1.6 0 0 1 3.2 0v6m0-.4V7.2a1.6 1.6 0 0 1 3.2 0v7.3a6.5 6.5 0 0 1-6.5 6.5h-.9a6 6 0 0 1-4.6-2.2L4 15.4a1.6 1.6 0 0 1 2.4-2.1L9 15.6" />
  </Icon>
)

export const IconZoomIn = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.6" />
    <path d="M11 8.4v5.2M8.4 11h5.2M15.8 15.8 20 20" />
  </Icon>
)

export const IconStop = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Icon>
)

export const IconKey = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="12" r="3.6" />
    <path d="M11.6 12H21M18 12v3M15 12v2.4" />
  </Icon>
)
