module.exports = {
    // We need to try to find the max number of src/dest this kumo model supports
    addSrcDestCountConfig(context, config, actions, feedbacks) {
        // The minimum kumo has these specs; anything over 16 src is a x:x (ie, 32x32)
        let max_src = 16
        let max_dest = 4

        actions.forEach(x => {
            if (x.options && 'source' in x.options) {
                if (max_src < parseInt(x.options.source)) max_src = parseInt(x.options.source)
            }

            if (x.options && 'destination' in x.options) {
                if (max_dest < parseInt(x.options.destination)) max_dest = parseInt(x.options.destination)
            }
        })

        max_src = Math.max(max_src, max_dest)
        if(max_dest == 4 && max_src == 16) {
            // Kumo 1604 model
        } else if (max_src == 16) {
            max_src = max_dest = 16
        } else if (max_src <= 32) {
            max_src = max_dest = 32
        } else {
            max_src = max_dest = 64
        }

        config.src_count = String(max_src)
        config.dest_count = String(max_dest)

        return true;
    }
}
