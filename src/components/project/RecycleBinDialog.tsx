import { IconTrash } from '@/components/icons'
import { Dialog } from '@/components/ui/Dialog'

type RecycleBinDialogProps = {
  open: boolean
  onClose: () => void
}

export function RecycleBinDialog({ open, onClose }: RecycleBinDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="回收站" testId="recycle-bin-dialog" width={560}>
      <div className="flex min-h-64 flex-col items-center justify-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.05] text-white/30">
          <IconTrash size={22} />
        </span>
        <h3 className="mt-4 text-[14px] font-medium text-white/82">回收站为空</h3>
        <p className="mt-1.5 text-[12px] text-white/38">删除的项目会在这里保留 30 天</p>
      </div>
    </Dialog>
  )
}
